#!/bin/bash
# ═══ فحص وتجهيز الأدوات — يكتشف الجهاز ويمشي بالمسار المناسب ═══
#   ./00_setup.sh            → يفحص ويطبع: الجهاز · الجاهز · الناقص وحجمه (بدون ما ينزّل شي)
#   ./00_setup.sh --install  → ينزّل الناقص (بعد موافقة المستخدم فقط)
#
#   ماك بمعالج أبل (M1+) : Homebrew · ffmpeg · Node · Python · mlx-whisper · أدوات Xcode (كاشف الوجه)
#   ماك إنتل            : نفسه، والتفريغ faster-whisper بدل mlx-whisper
#   ويندوز (Git Bash)     : winget · ffmpeg · Node · Python · faster-whisper · mediapipe (كاشف الوجه)
#   ريموشن (محرّك الرسم) ينزل لحاله أول مرة بكل مشروع (~500 ميقا) عبر 04b_remotion.sh setup.
INSTALL=0; [ "$1" = "--install" ] && INSTALL=1
MISS=(); OK=(); NOTE=(); SIZE=()
have(){ command -v "$1" >/dev/null 2>&1; }
line(){ printf '%s\n' "$1"; }

case "$(uname -s)" in
  Darwin)  OS=mac ;;
  MINGW*|MSYS*|CYGWIN*) OS=win ;;
  *)       OS=linux ;;
esac
ARCH="$(uname -m)"
APPLE=0; [ "$OS" = mac ] && [ "$ARCH" = arm64 ] && APPLE=1

# بايثون: بالويندوز اسمه غالباً python لا python3 — نسوي له اختصاراً عشان كل الأدوات تشتغل
PY=python3
if ! have python3 && have python; then
  PY=python
  if [ "$OS" = win ]; then mkdir -p "$HOME/bin"; printf '#!/bin/bash\nexec python "$@"\n' > "$HOME/bin/python3"; chmod +x "$HOME/bin/python3"; export PATH="$HOME/bin:$PATH"; fi
fi
pymod(){ $PY -c "import $1" 2>/dev/null; }

case $OS in
  mac) if [ $APPLE -eq 1 ]; then line "الجهاز: ماك بمعالج أبل (M) — التفريغ على معالج الرسوميات، أسرع شي"
       else line "الجهاز: ماك بمعالج إنتل — التفريغ على المعالج (أبطأ شوي)"; fi ;;
  win) line "الجهاز: ويندوز" ;;
  *)   line "الجهاز: لينكس (غير مجرّب — المسار نفس الويندوز تقريباً)" ;;
esac

# ── الأساسيات
have ffmpeg && OK+=("ffmpeg") || { MISS+=("ffmpeg"); SIZE+=("أداة القص والصوت ~80 ميقا"); }
have node   && OK+=("node")   || { MISS+=("node");   SIZE+=("Node (يشغّل محرّك الرسم) ~70 ميقا"); }
have $PY    && OK+=("python") || { MISS+=("python"); SIZE+=("Python ~50 ميقا"); }
pymod numpy && OK+=("numpy")  || { MISS+=("numpy");  SIZE+=("numpy ~20 ميقا"); }
# ── التفريغ
if [ $APPLE -eq 1 ]; then
  pymod mlx_whisper && OK+=("التفريغ") || { MISS+=("mlx-whisper"); SIZE+=("أداة التفريغ ~50 ميقا + نموذجها أول تشغيل ~3 قيقا"); }
else
  pymod faster_whisper && OK+=("التفريغ") || { MISS+=("faster-whisper"); SIZE+=("أداة التفريغ ~100 ميقا + نموذجها أول تشغيل ~3 قيقا"); }
fi
# ── كاشف الوجه وقصّ الشخص
if [ "$OS" = mac ]; then
  have swiftc && OK+=("كاشف الوجه") || { MISS+=("xcode"); SIZE+=("أدوات Xcode (كاشف الوجه، مجانية من أبل) ~1 قيقا"); }
else
  pymod mediapipe && pymod cv2 && OK+=("كاشف الوجه") || { MISS+=("mediapipe"); SIZE+=("كاشف الوجه mediapipe ~150 ميقا"); }
fi

line "الجاهز: ${OK[*]:-لا شيء}"
if [ ${#MISS[@]} -eq 0 ]; then line "✅ كل شي جاهز — نقدر نبدأ."; exit 0; fi
line "الناقص:"
for s in "${SIZE[@]}"; do line "  • $s"; done
line "(ومحرّك الرسم ريموشن ينزل لحاله أول مشروع ~500 ميقا)"

if [ $INSTALL -eq 0 ]; then line "للتنزيل: $0 --install"; exit 10; fi

pipi(){ $PY -m pip install --quiet --user "$@" 2>/dev/null || $PY -m pip install --quiet --break-system-packages "$@" 2>/dev/null || $PY -m pip install --quiet "$@"; }
winget_i(){ winget install --silent --accept-package-agreements --accept-source-agreements -e --id "$1"; }

for m in "${MISS[@]}"; do
  case "$m" in
    ffmpeg|node|python)
      if [ "$OS" = mac ]; then
        if ! have brew; then NOTE+=("لازم Homebrew أول — المستخدم يلصق هذا بالتيرمنال: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""); continue; fi
        case $m in ffmpeg) line "⏬ ffmpeg…"; brew install ffmpeg ;; node) line "⏬ Node…"; brew install node ;; python) line "⏬ Python…"; brew install python ;; esac || NOTE+=("$m فشل")
      elif [ "$OS" = win ]; then
        if ! have winget; then NOTE+=("winget مو موجود — حدّث «App Installer» من متجر مايكروسوفت"); continue; fi
        case $m in ffmpeg) line "⏬ ffmpeg…"; winget_i Gyan.FFmpeg ;; node) line "⏬ Node…"; winget_i OpenJS.NodeJS.LTS ;; python) line "⏬ Python…"; winget_i Python.Python.3.12 ;; esac || NOTE+=("$m فشل")
        NOTE+=("بعد تنزيل $m بالويندوز: سكّر تطبيق كلود وافتحه من جديد عشان يشوف الأداة")
      else NOTE+=("نزّل $m بمدير الحزم (apt/dnf)"); fi ;;
    numpy)          line "⏬ numpy…"; pipi numpy || NOTE+=("numpy فشل") ;;
    mlx-whisper)    line "⏬ mlx-whisper…"; pipi mlx-whisper || NOTE+=("mlx-whisper فشل") ;;
    faster-whisper) line "⏬ faster-whisper…"; pipi faster-whisper || NOTE+=("faster-whisper فشل") ;;
    mediapipe)      line "⏬ mediapipe…"; pipi mediapipe opencv-python || NOTE+=("mediapipe فشل") ;;
    xcode)          xcode-select --install 2>/dev/null
                    NOTE+=("طلعت نافذة من أبل لأدوات Xcode — اضغط «Install» وانتظرها تخلص (~10 دقايق)، وبعدها كمّل") ;;
  esac
done

[ ${#NOTE[@]} -gt 0 ] && printf '⚠️  %s\n' "${NOTE[@]}"
exec "$0"    # يفحص من جديد ويطبع النتيجة النهائية
