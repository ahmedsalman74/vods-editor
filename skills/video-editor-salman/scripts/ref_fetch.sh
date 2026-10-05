#!/bin/bash
# ref_fetch.sh <رابط pin.it>  →  يحفظ شبكة إطارات (20 لقطة) باسم g_<المعرّف>.jpg بمجلد refs/ عند المستخدم
set -e
L="$1"; ID="${L##*/}"
D="$(python3 -c "import sys;sys.path.insert(0,'$(cd "$(dirname "$0")" && pwd)');import _paths;_paths.ensure();print(_paths.data('refs'))")"   # refs/ بمجلد بيانات المستخدم
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
H=$(curl -sL -A "$UA" "$L")
V=$(printf '%s' "$H" | grep -o 'https://v1\.pinimg\.com/videos/[^"'"'"']*_720w\.mp4' | head -1)
[ -z "$V" ] && { echo "ما لقيت فيديو في $L"; exit 1; }
T="$(mktemp -d)/ref.mp4"; curl -sL -o "$T" "$V"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$T")
FPS=$(python3 -c "print(max(0.2,min(4,20/$DUR)))")
ffmpeg -v error -i "$T" -vf "fps=$FPS,scale=220:-1,tile=5x4" -frames:v 1 -q:v 6 -y "$D/g_$ID.jpg"
rm -f "$T"; echo "حُفظ: $D/g_$ID.jpg  (المدة ${DUR%.*} ث)"
