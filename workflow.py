"""Twitch, YouTube, TikTok and Instagram video intake and local analysis."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import urlparse, parse_qs

ROOT = Path(os.environ.get('VODS_EDITOR_HOME', str(Path.home()/'Documents'/'VodsEditor'))).expanduser().resolve()
FFBIN = os.environ.get('FFMPEG_DIR')
if FFBIN:
    os.environ['PATH'] = FFBIN + os.pathsep + os.environ.get('PATH', '')
os.environ.setdefault('XDG_CACHE_HOME', str(ROOT/'cache'))
os.environ.setdefault('HF_HOME', str(ROOT/'cache'/'huggingface'))

def media_tool(name):
    result=shutil.which(name)
    if not result:
        raise RuntimeError(f'{name} not found. Install FFmpeg and add its bin directory to PATH, or set FFMPEG_DIR.')
    return result

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def probe(source):
    return json.loads(subprocess.check_output([media_tool('ffprobe'), '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(source)], encoding='utf-8'))

def source_platform(url):
    """Accept one video/share link, not profiles, searches, playlists or arbitrary hosts."""
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Use an HTTPS video link without credentials or a custom port.')
    host = (parsed.hostname or '').lower()
    path = parsed.path.rstrip('/')
    query = parse_qs(parsed.query)
    if host in ('twitch.tv', 'www.twitch.tv', 'm.twitch.tv') and (re.fullmatch(r'/videos/\d+', path) or re.fullmatch(r'/[^/]+/clip/[^/]+', path)):
        return 'twitch'
    if host == 'clips.twitch.tv' and re.fullmatch(r'/[^/]+', path):
        return 'twitch'
    if host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com') and ((path == '/watch' and query.get('v')) or re.fullmatch(r'/(shorts|live)/[^/]+', path)):
        return 'youtube'
    if host == 'youtu.be' and re.fullmatch(r'/[^/]+', path):
        return 'youtube'
    if host in ('tiktok.com', 'www.tiktok.com', 'm.tiktok.com') and (re.fullmatch(r'/@[^/]+/video/\d+', path) or re.fullmatch(r'/t/[^/]+', path)):
        return 'tiktok'
    if host in ('vm.tiktok.com', 'vt.tiktok.com') and re.fullmatch(r'/[^/]+', path):
        return 'tiktok'
    if host in ('instagram.com', 'www.instagram.com', 'm.instagram.com') and re.fullmatch(r'/(reel|reels|p|tv|share/reel)/[^/]+', path):
        return 'instagram'
    raise ValueError('Use a single Twitch VOD/clip, YouTube video/Short, TikTok video/share link, or Instagram video/Reel. Profiles, playlists and live channels are not accepted.')

def validate_video_info(info, platform):
    if not isinstance(info, dict) or info.get('_type') in ('playlist', 'multi_video') or 'entries' in info:
        raise ValueError('This link contains multiple items. Select one individual video before downloading.')
    if info.get('is_live') or info.get('live_status') in ('is_live', 'is_upcoming'):
        raise ValueError('Use a finished recording, not an active or upcoming livestream.')
    extractor = str(info.get('extractor_key') or info.get('extractor') or '').lower()
    if not extractor.startswith(platform):
        raise ValueError('The resolved video does not match the selected platform. Review the link before downloading.')
    duration = float(info.get('duration') or 0)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Cannot determine the video duration; inspect the link before downloading.')
    if not any(f.get('vcodec') not in (None, 'none') for f in info.get('formats', [])) and info.get('vcodec') in (None, 'none'):
        raise ValueError('No playable video stream was found. Supply an individual video or a local file.')
    return duration

def download(args):
    from yt_dlp import YoutubeDL
    platform = source_platform(args.url)
    if args.platform != 'auto' and args.platform != platform:
        raise ValueError(f'Selected {args.platform}, but the link is from {platform}. Correct the selection or link.')
    video_format = 'bestvideo*+bestaudio/best' if args.quality == 'source' else f'bestvideo*[height<={args.quality[:-1]}]+bestaudio/best[height<={args.quality[:-1]}]'
    # Preserve existing Twitch paths; isolate other platforms to avoid ID collisions.
    destination = ROOT/'vods' if platform == 'twitch' else ROOT/'vods'/platform
    opts = {'noplaylist': True, 'format': video_format, 'ffmpeg_location': str(Path(media_tool('ffmpeg')).parent),
            'outtmpl': str(destination / '%(id)s' / '%(id)s.%(ext)s'),
            'writeinfojson': True, 'continuedl': True, 'overwrites': False,
            'concurrent_fragment_downloads': 4, 'windowsfilenames': True}
    node = shutil.which('node')
    if node and Path(node).exists():
        opts['js_runtimes'] = {'node': {'path': node}}
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(args.url, download=False)
        duration = validate_video_info(info, platform)
        selected = info.get('requested_formats') or [info]
        estimate = sum(float(f.get('filesize') or f.get('filesize_approx') or ((f.get('tbr') or 8000) * duration * 1000 / 8)) for f in selected)
        ROOT.mkdir(parents=True, exist_ok=True)
        free = shutil.disk_usage(ROOT).free
        summary = {'platform': platform, 'quality': args.quality, 'id': info['id'], 'title': info.get('title'), 'duration_seconds': duration,
                   'estimated_download_GB': round(estimate / 1e9, 2), 'free_GB': round(free / 1e9, 2)}
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if args.info_only:
            return
        if free < estimate * 2 + 10 * 1024**3:
            raise RuntimeError('Not enough free space for this video, temporary merge, and 10 GB reserve. Free space or select a smaller download.')
        ydl.download([args.url])
        print('Downloaded video folder:', destination / info['id'])

def analysis_dir(source):
    stat = source.stat()
    key = hashlib.sha256(f'{source}:{stat.st_size}:{stat.st_mtime_ns}'.encode()).hexdigest()[:10]
    safe = re.sub(r'[^A-Za-z0-9_-]+', '-', source.stem)[:60]
    return ROOT / 'analysis' / f'{safe}-{key}'

def audio_chunk(source, start, duration):
    import numpy as np
    raw = subprocess.check_output([media_tool('ffmpeg'), '-v', 'error', '-ss', str(start), '-i', str(source), '-t', str(duration), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'])
    return np.frombuffer(raw, dtype=np.float32).copy()

def srt_time(seconds):
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3600000)
    minutes, millis = divmod(millis, 60000)
    seconds, millis = divmod(millis, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{millis:03}'

def analyze(args):
    import numpy as np
    import torch
    import whisper
    source = Path(args.source).resolve(strict=True)
    meta = probe(source)
    duration = float(meta['format']['duration'])
    if not any(s['codec_type'] == 'audio' for s in meta['streams']):
        raise ValueError('No audio stream found; visual review is still possible with the frames command.')
    out = analysis_dir(source)
    out.mkdir(parents=True, exist_ok=True)
    save(out/'source.json', {'source': str(source), 'probe': meta})
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    if device == 'cuda' and torch.cuda.mem_get_info()[0] < 2500 * 1024**2:
        device = 'cpu'
    model = whisper.load_model(args.model, device=device, download_root=str(ROOT/'models'/'whisper'))
    # Fifteen-minute PCM chunks stay in memory. No source transcode or audio copy is saved.
    segments, peaks = [], []
    for index, start in enumerate(range(0, math.ceil(duration), 900)):
        cached = out/f'{args.model}-{args.language or "auto"}-chunk-{index:04}.json'
        if cached.exists():
            result = json.loads(cached.read_text(encoding='utf-8'))
        else:
            print(f'Transcribing {start:.0f}s / {duration:.0f}s on {device}', flush=True)
            audio = audio_chunk(source, start, min(900, duration-start))
            result = model.transcribe(audio, language=args.language, task='transcribe', fp16=device=='cuda', verbose=None, word_timestamps=True, condition_on_previous_text=False)
            # Sparse loudness cues nominate review windows; they do not identify kills.
            rms = [(start+i/16000, float(np.sqrt(np.mean(audio[i:i+16000]**2)))) for i in range(0,len(audio),16000) if len(audio[i:i+16000])]
            result['audio_peaks'] = sorted(rms, key=lambda x:x[1], reverse=True)[:12]
            save(cached, result)
        for item in result.get('segments', []):
            seg = dict(item, start=item['start']+start, end=item['end']+start)
            seg['words'] = [dict(w,start=w['start']+start,end=w['end']+start) for w in item.get('words',[])]
            segments.append(seg)
        peaks.extend(result.get('audio_peaks', []))
    save(out/'transcript.json', {'source':str(source),'model':args.model,'segments':segments})
    (out/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{srt_time(s["start"])} --> {srt_time(s["end"])}\n{s["text"].strip()}' for i,s in enumerate(segments))+'\n', encoding='utf-8-sig')
    cues = [{'time':float(t),'score':float(r),'reason':'audio energy; visually verify'} for t,r in peaks]
    terms = re.compile(r'\b(ace|clutch|insane|nice shot|oh my god|one versus|what the)\b|ايس|إيس|كلتش|جامد|يا نهار|يا الله', re.IGNORECASE)
    cues += [{'time':s['start'],'score':1.0,'reason':'speech cue: '+s['text'].strip()} for s in segments if terms.search(s['text'])]
    chosen=[]
    for cue in sorted(cues,key=lambda c:c['score'],reverse=True):
        if all(abs(cue['time']-other['time'])>30 for other in chosen):
            chosen.append(dict(cue,start=max(0,cue['time']-15),end=min(duration,cue['time']+20),verified=False))
        if len(chosen)>=args.max_candidates:
            break
    save(out/'candidate-windows.json', {'source':str(source),'note':'Review cues only. Not automatic kill, clutch, ace, or comedy detection. Review the full round and preserve context. Scores are heuristic priorities, not confidence probabilities.','candidates':sorted(chosen,key=lambda c:c['start'])})
    print('Analysis ready:',out)

def frames(args):
    from PIL import Image, ImageDraw
    source = Path(args.source).resolve(strict=True)
    duration = float(probe(source)['format']['duration'])
    if args.start < 0 or args.end <= args.start or args.end > duration + .1:
        raise ValueError('Frame range must fall inside the source duration.')
    out=analysis_dir(source)/f'frames-{args.start:g}-{args.end:g}'
    out.mkdir(parents=True,exist_ok=True)
    times=[args.start + (args.end-args.start)*i/args.count for i in range(args.count)]
    sheet=Image.new('RGB',(960,300*math.ceil(len(times)/3)), '#17171b')
    draw=ImageDraw.Draw(sheet)
    for i,t in enumerate(times):
        frame=out/f'{i:03}-{t:.3f}.jpg'
        if not frame.exists():
            subprocess.run([media_tool('ffmpeg'),'-v','error','-n','-ss',str(t),'-i',str(source),'-frames:v','1','-q:v','2',str(frame)],check=True)
        with Image.open(frame) as original:
            thumb=original.copy();thumb.thumbnail((320,270))
            x,y=(i%3)*320,(i//3)*300
            sheet.paste(thumb,(x,y+25));draw.text((x+6,y+5),srt_time(t),fill='white')
    sheet.save(out/'contact-sheet.jpg',quality=90)
    print(out/'contact-sheet.jpg')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    dl=sub.add_parser('download');dl.add_argument('url');dl.add_argument('--info-only',action='store_true');dl.add_argument('--platform',choices=['auto','twitch','youtube','tiktok','instagram'],default='auto');dl.add_argument('--quality',choices=['source','1080p','720p'],default='source');dl.set_defaults(func=download)
    an=sub.add_parser('analyze');an.add_argument('source');an.add_argument('--model',choices=['small','turbo'],default='small');an.add_argument('--language',default=None);an.add_argument('--max-candidates',type=int,default=50);an.set_defaults(func=analyze)
    fr=sub.add_parser('frames');fr.add_argument('source');fr.add_argument('--start',type=float,required=True);fr.add_argument('--end',type=float,required=True);fr.add_argument('--count',type=int,choices=range(1,49),default=12);fr.set_defaults(func=frames)
    args=parser.parse_args();args.func(args)

if __name__=='__main__':
    main()
