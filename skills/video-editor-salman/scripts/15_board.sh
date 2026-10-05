#!/bin/bash
# لوحة الآليات — صورة واحدة فيها لقطة من كل آلية بالمقطع، تُحفظ جنب التسليم.
#   ./15_board.sh "<اسم المقطع>" <مسار.mp4> [مسار الخرج.jpg]
# ليش: الأسماء تُنسى، الصور لا. لمّا يقول «متراكب مع شي قديم» تُفتح اللوحة ويُقرَّر بثانية.
set -e
NAME="$1"; VID="$2"; OUT="${3:-$(dirname "$VID")/.لوحة-$NAME.jpg}"
K="$(python3 -c "import sys;sys.path.insert(0,'$(cd "$(dirname "$0")" && pwd)');import _paths;print(_paths.HOME)")"   # مجلد بيانات المستخدم
TIMES=$(python3 -c "
import json,sys
M=json.load(open('$K/mechanisms.json'))
v=[x for x in M['videos'] if x['name']=='''$NAME''']
if not v: sys.exit('❌ ما لقيت المقطع بالسجل: $NAME')
seen=[];out=[]
for c in v[0]['mechs']:
    if c in seen: continue
    seen.append(c)
    u=[w for w in M['mechs'][c].get('used',[]) if w[0]==v[0]['id']]
    if u: out.append(str(u[0][1]))
print(' '.join(out))")
[ -z "$TIMES" ] && { echo "❌ ما فيه أوقات مسجّلة"; exit 2; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VID")
TMP=$(mktemp -d); i=0; IN=""
for t in $TIMES; do
  i=$((i+1)); P=$(printf "%02d" $i)
  # +1.9 ث: الرسمة تكون استقرّت — التقاطها وهي داخلة يعطي لقطة نصف مرسومة
  ffmpeg -v error -ss "$(python3 -c "print(max(0,min($t+1.9,$DUR-0.6)))")" -i "$VID" -frames:v 1 -vf scale=260:-1 -y "$TMP/f$P.jpg"
done
N=$i; COLS=5; ROWS=$(( (N+COLS-1)/COLS ))
ffmpeg -v error -pattern_type glob -i "$TMP/f*.jpg" -vf "tile=${COLS}x${ROWS}:padding=8:color=#17181A" -frames:v 1 -pix_fmt yuvj420p -huffman optimal -y "$OUT"
rm -rf "$TMP"
echo "✅ $OUT  ($N آلية)"
