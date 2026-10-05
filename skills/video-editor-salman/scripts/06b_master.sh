#!/bin/bash
# ═══ معايرة الصوت لمعيار المنصات + ملف صوتي بالخلفية (اختياري) بخفض تلقائي ═══
#   ./06b_master.sh <work> <in.mp4> [out.mp4]
# • المعايرة: ‎-14 LUFS (نفس علو الفيديوهات الثانية بالفيد — بدونها صوتك يطلع أخفض)
# • الخلفية الصوتية: تشتغل بس إذا وُجد <work>/bg-audio.mp3|m4a|wav (أو BG=مسار)،
#   وتنخفض تلقائياً كل ما تتكلم (sidechain) فما تزاحم صوتك.
#   ⛔ ما نستخدم موسيقى — المقصود ملف صوتي (أصوات بشرية، أجواء، همهمة مكان).
# • الصورة تُنسخ كما هي — لا إعادة ترميز ولا خسارة جودة.
# متغيرات: BG · BG_GAIN (0.28) · LUFS (-14) · NO_LOUDNORM=1
set -e
W="$(cd "$1" && pwd)"; IN="$2"; OUT="${3:-${IN%.mp4}-master.mp4}"
[ -f "$IN" ] || { echo "❌ ما لقيت $IN"; exit 2; }
G="${BG_GAIN:-${MUSIC_GAIN:-0.28}}"; I="${LUFS:--14}"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
FO=$(python3 -c "print(max(0,round($DUR-1.4,3)))")

MUS="${BG:-$MUSIC}"
if [ -z "$MUS" ]; then for n in bg-audio bg sound music; do for e in mp3 m4a wav aac; do
  [ -f "$W/$n.$e" ] && MUS="$W/$n.$e" && break 2; done; done; fi

MIX="$W/.master-mix.wav"; NRM="$W/.master-norm.wav"
if [ -n "$MUS" ]; then
  echo "🔊 خلفية صوتية: $(basename "$MUS")  (مستوى $G · تنخفض وقت الكلام)"
  ffmpeg -v error -stats -i "$IN" -stream_loop -1 -i "$MUS" -filter_complex \
   "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=2[v0][sc];\
    [1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=$G,atrim=0:$DUR,asetpts=N/SR/TB,\
    afade=t=in:st=0:d=1.0,afade=t=out:st=$FO:d=1.4[m];\
    [m][sc]sidechaincompress=threshold=0.035:ratio=9:attack=8:release=320[md];\
    [v0][md]amix=inputs=2:duration=first:normalize=0[a]" \
   -map "[a]" -ac 2 -ar 48000 -y "$MIX"
else
  echo "🔊 بلا خلفية صوتية (حط bg-audio.mp3 بمجلد الشغل إذا بغيتها)"
  ffmpeg -v error -i "$IN" -vn -ac 2 -ar 48000 -y "$MIX"
fi

if [ "$NO_LOUDNORM" = "1" ]; then cp "$MIX" "$NRM"; echo "⏭  المعايرة متخطّاة";
else
  echo "📏 قياس العلو…"
  M=$(ffmpeg -hide_banner -nostats -v info -i "$MIX" -af "loudnorm=I=$I:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | \
      python3 -c "import sys,json,re;s=sys.stdin.read();m=re.findall(r'\{[^{}]*input_i[^{}]*\}',s,re.S);print(json.dumps(json.loads(m[-1])) if m else '')")
  if [ -z "$M" ]; then echo "⚠️  ما قدرت أقيس — يمرّ كما هو بلا معايرة"; cp "$MIX" "$NRM";
  else
    echo "$M" > "$W/.loud.json"
    read -r II TP LRA GAIN HEAD < <(I="$I" python3 - "$W/.loud.json" <<'PYCALC'
import json,os,sys
d=json.load(open(sys.argv[1]))
ii=float(d["input_i"]); tp=float(d["input_tp"]); tgt=float(os.environ["I"])
g=tgt-ii
print(ii, tp, d["input_lra"], round(g,2), round(-1.0-(tp+g),2))
PYCALC
)
    echo "   قبل: $II LUFS · الذروة $TP dBTP · المدى $LRA LU"
    # ⛔⛔ كسب ثابت فقط — لا loudnorm ولا ضاغط ولا محدّد على صوته.
    #    loudnorm حتى بـlinear=true ترجع normalization_type=dynamic وتقلّص المدى
    #    (قِسناها: 2.9 → 1.8 LU) والمستخدم يسمعها «صوتي يرتفع وينقص».
    #    المعايرة معناها رفع علو، لا تغيير ديناميكية.
    if [ "$(python3 -c "print(1 if $HEAD < 0 else 0)")" = "1" ]; then
      echo "   ⚠️  الكسب ${GAIN}dB يتجاوز سقف الذروة — أخفضه بدل ما أضغط"
      GAIN=$(python3 -c "print(round($GAIN+$HEAD,2))")
    fi
    echo "   كسب ثابت ${GAIN} dB → $I LUFS · المدى الديناميكي كما هو"
    ffmpeg -v error -stats -i "$MIX" -af "volume=${GAIN}dB" -ar 48000 -y "$NRM"
    rm -f "$W/.loud.json"
  fi
fi

ffmpeg -v error -stats -i "$IN" -i "$NRM" -map 0:v:0 -map 1:a:0 -c:v copy \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -y "$OUT"
rm -f "$MIX" "$NRM"
echo "✅ $OUT"
ffmpeg -hide_banner -nostats -v info -i "$OUT" -af "loudnorm=I=$I:TP=-1.5:print_format=summary" -f null - 2>&1 | grep -E "Input Integrated|Input True Peak" || true
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
