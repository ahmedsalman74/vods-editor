import contextlib
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
import tempfile
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('workflow',Path(__file__).resolve().parents[1]/'workflow.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)

class IntakeTests(unittest.TestCase):
    def test_platform_routes(self):
        links={'twitch':['https://www.twitch.tv/videos/2888285114','https://clips.twitch.tv/ClipSlug','https://www.twitch.tv/channel/clip/ClipSlug'],
               'youtube':['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk&list=ignored','https://youtube.com/shorts/abcdefghijk','https://youtube.com/live/abcdefghijk'],
               'tiktok':['https://www.tiktok.com/@user/video/123456789','https://vm.tiktok.com/ABC/','https://vt.tiktok.com/ABC/','https://www.tiktok.com/t/ABC/'],
               'instagram':['https://www.instagram.com/reel/ABC/','https://instagram.com/p/ABC/','https://www.instagram.com/share/reel/ABC/']}
        for platform, urls in links.items():
            for url in urls:
                with self.subTest(url=url):self.assertEqual(w.source_platform(url),platform)

    def test_reject_wrong_hosts_and_collections(self):
        for url in ['http://youtu.be/abc','https://youtube.com.evil.example/watch?v=abc','https://youtube.com@evil.example/watch?v=abc','https://www.youtube.com/playlist?list=123','https://twitch.tv/channel','https://instagram.com/user/','https://example.com/video','file:///D:/video.mp4','https://youtube.com:444/watch?v=abc']:
            with self.subTest(url=url),self.assertRaises(ValueError):w.source_platform(url)

    def info(self,platform='youtube',**overrides):
        return dict({'id':'test-id','title':'Test','extractor_key':platform,'duration':60,'vcodec':'h264','filesize':1000000},**overrides)

    def test_metadata_rejections(self):
        for info in [None,{'_type':'playlist','entries':[]},self.info(is_live=True),self.info(live_status='is_upcoming'),self.info(duration=0),self.info(duration=float('nan')),self.info(vcodec='none'),self.info('Instagram')]:
            with self.subTest(info=info),self.assertRaises(ValueError):w.validate_video_info(info,'youtube')
        self.assertEqual(w.validate_video_info(self.info(live_status='was_live'),'youtube'),60)

    def invoke(self,info_only=False,platform='youtube',quality='1080p',free=100*1024**3):
        args=SimpleNamespace(url='https://youtu.be/abcdefghijk',platform=platform,quality=quality,info_only=info_only)
        with tempfile.TemporaryDirectory() as tmp,patch.object(w,'ROOT',Path(tmp)),patch.object(w,'media_tool',return_value='ffmpeg'),patch('yt_dlp.YoutubeDL') as cls,patch.object(w.shutil,'disk_usage',return_value=SimpleNamespace(free=free)),contextlib.redirect_stdout(io.StringIO()):
            ydl=cls.return_value.__enter__.return_value
            ydl.extract_info.return_value=self.info()
            w.download(args)
            return cls.call_args.args[0],ydl

    def test_preview_never_downloads(self):
        opts,ydl=self.invoke(info_only=True)
        ydl.download.assert_not_called()
        self.assertTrue(opts['noplaylist']);self.assertFalse(opts['overwrites'])

    def test_selected_quality_and_destination(self):
        opts,ydl=self.invoke()
        self.assertIn('height<=1080',opts['format'])
        self.assertIn(str(Path('vods')/'youtube'),opts['outtmpl'])
        ydl.download.assert_called_once_with(['https://youtu.be/abcdefghijk'])

    def test_mismatch_blocks_before_extract(self):
        with patch('yt_dlp.YoutubeDL') as cls,self.assertRaises(ValueError):self.invoke(platform='twitch')
        cls.assert_not_called()

    def test_disk_guard(self):
        with self.assertRaises(RuntimeError):self.invoke(free=100)

    def test_existing_timing_and_paths(self):
        self.assertEqual(w.srt_time(3600.123),'01:00:00,123')
        self.assertEqual(w.srt_time(59.9996),'00:01:00,000')

if __name__=='__main__':unittest.main(verbosity=2)
