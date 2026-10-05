#!/bin/bash
# ═══ المحرّك الثاني: ريموشن (تايم-لاين حي بدل رسم فريمات) ═══
#   ./04b_remotion.sh <work> setup            → يجهّز المشروع بمجلد الشغل (ينزّل ~500 ميقا أول مرة)
#   ./04b_remotion.sh <work> sync             → يحدّث البيانات والأصول فقط (بلا تنزيل)
#   ./04b_remotion.sh <work> studio [port]    → يفتح الاستوديو الحي
#   ./04b_remotion.sh <work> render [out.mp4] → يطلّع MP4 مباشرة (بلا فريمات)
# المشاهد تُكتب بـ<work>/Scenes.tsx — وينسخ للمشروع مع كل تشغيل (لا تعدّل نسخة remotion/src).
set -e
W="$(cd "$1" && pwd)"; CMD="${2:-setup}"; ARG="$3"
TPL="$(cd "$(dirname "$0")/remotion-template" && pwd)"
R="$W/remotion"

sync_all(){
  mkdir -p "$R/src" "$R/public"
  # ملفات الهيكل: تُحدَّث دائماً ما عدا اللي يعدّله المستخدم
  for f in package.json tsconfig.json remotion.config.ts .gitignore README.md; do
    [ -f "$TPL/$f" ] && cp "$TPL/$f" "$R/$f"; done
  for f in index.ts Root.tsx Ad.tsx theme.ts font.ts stage.ts util.tsx Chrome.tsx Captions.tsx Outro.tsx Guides.tsx; do
    cp "$TPL/src/$f" "$R/src/$f"; done
  # المشاهد: المصدر الوحيد <work>/Scenes.tsx (الفواحص تقرأه من هنا) — ينسخ للمشروع بكل تشغيل.
  #   أول مرة ينسخ القالب الفاضي (وضع «قص وكابشن بس» يبقى فاضي كذا).
  [ -f "$W/Scenes.tsx" ] || cp "$TPL/src/Scenes.tsx" "$W/Scenes.tsx"
  cp "$W/Scenes.tsx" "$R/src/Scenes.tsx"
  # الأسلوب: <work>/style.json ← {"style": "simple" | "collage" | "documentary" | "board"} (الافتراضي simple)
  #   collage و documentary و board تشترك بعُدّة وحدة (styles/collage/kit) — الفرق بالدليل لا بالكود.
  STYLE="$(python3 -c "import json,os;p='$W/style.json';print(json.load(open(p)).get('style','simple') if os.path.exists(p) else 'simple')")"
  case "$STYLE" in collage|documentary|board|vox) KIT=collage ;; *) KIT=simple ;; esac
  SD="$(cd "$(dirname "$0")/.." && pwd)/styles/$KIT"
  if [ -d "$SD/kit" ]; then cp "$SD"/kit/*.tsx "$R/src/"; fi
  if [ -d "$SD/assets" ]; then find "$SD/assets" -type f ! -name '*.md' -exec cp {} "$R/public/" \;; fi
  # أصول المقطع نفسه (صور Pexels · صوره · الكتاب): <work>/assets/*
  [ -d "$W/assets" ] && find "$W/assets" -type f -exec cp {} "$R/public/" \;
  echo "الأسلوب: $STYLE"

  cp "$W/caps.json" "$R/src/caps.json"
  python3 - "$W" "$R" <<'PY'
import json, os, sys
W, R = sys.argv[1], sys.argv[2]
def rd(name, dflt):
    p = os.path.join(W, name)
    return json.load(open(p)) if os.path.exists(p) else dflt
caps  = json.load(open(os.path.join(W, "caps.json")))
theme = rd("theme.json", {})
sfx   = rd("sfx.json", {})
proj = {
  "theme": {k: theme.get(k) for k in ("bg","ink","acc","clay","mut","sand","sky","warm","cream","font","fontDisplay","fontLocal","handle","faceAnchor","captionSize","captionWeight","captionMaxW","captionBottom") if theme.get(k) is not None},
  "total": round(caps["total"], 3),
  "outro": float(sfx.get("outro", 0.0)),   # الافتراضي بلا كرت نهاية — المقطع يخلص على وجهه
  "sfx":   os.path.exists(os.path.join(W, "sfx.wav")),
  "stage": rd("stage.json", [{"s":0, "e":9999, "m":"FULL"}]),
  "outro_copy": rd("outro.json", {"line":"", "recap":[], "cta_top":"", "cta_word":"", "tail":""}),
  "guides": bool(rd("safe.json", {}).get("guides", False)),   # true → أدلّة المنطقة الآمنة بالاستوديو
  "rects": rd("rects.json", {}),
  "capMove": rd("capmove.json", []),                           # [[من, إلى, bottom]] — كابشن يتزحزح عن رقم مهم بلقطة                              # مستطيلات مخصّصة (من حارس الوجه)
}
json.dump(proj, open(os.path.join(R, "src", "project.json"), "w"), ensure_ascii=False, indent=1)
print("project.json → المدة", proj["total"], "+ ختام", proj["outro"], "· مؤثرات:", "نعم" if proj["sfx"] else "لا")
PY
  [ -f "$W/cutz.mp4" ] && cp "$W/cutz.mp4" "$R/public/video.mp4"          # للمعاينة بالاستوديو
  # ⛔ القاعدة ٩٠ — الرندر يقرأ وسيطاً 4:4:4 لا المقصوص 4:2:0.
  #    مفكّك ريموشن (swscale) يفقد ‎-1.7 سطوع بفكّ 4:2:0، وصفراً بفكّ 4:4:4 — مقيس على مقطع حقيقي.
  #    crf 8 = خطأ 0.6 مقابل الفكّ الدقيق، وحجمه ≈ ٥٣٠ ميقا لثلاث دقايق. يُبنى مرة ويُعاد لو تغيّر cutz.
  if [ -f "$W/cutz.mp4" ]; then
    if [ ! -f "$W/.cutz444.mp4" ] || [ "$W/cutz.mp4" -nt "$W/.cutz444.mp4" ]; then
      echo "🎨 وسيط 4:4:4 للرندر (مرة وحدة، ~دقيقتين)…"
      ffmpeg -y -v error -i "$W/cutz.mp4" -vf format=yuv444p -c:v libx264 -crf 8 -preset fast \
        -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -an "$W/.cutz444.mp4"
    fi
    cp "$W/.cutz444.mp4" "$R/public/video444.mp4"
  fi
  [ -f "$W/sfx.wav" ]  && cp "$W/sfx.wav"  "$R/public/sfx.wav"
  [ -f "$W/voice.wav" ] && cp "$W/voice.wav" "$R/public/voice.wav"   # للمعاينة بالاستوديو فقط
  LOGO="$(python3 -c "import json,os,sys;p=os.path.join('$W','theme.json');print(json.load(open(p)).get('logo','logo.png') if os.path.exists(p) else 'logo.png')")"
  [ -f "$W/$LOGO" ] && cp "$W/$LOGO" "$R/public/logo.png"
  # ⛔ الشعار المفقود كان يُسقط الرندر كله — نعلنه بـproject.json فتتخطّاه المكوّنات
  if [ ! -f "$R/public/logo.png" ]; then
    echo "⚠️  ما فيه شعار بـ$W — يُرسم بدونه"
    python3 -c "import json,sys;p=sys.argv[1];d=json.load(open(p));d['logo']=False;json.dump(d,open(p,'w'),ensure_ascii=False,indent=1)" "$R/src/project.json"
  fi
  echo "✅ البيانات والأصول محدّثة بـ$R"
}

case "$CMD" in
  setup)
    sync_all
    if [ -d "$R/node_modules" ]; then echo "المكتبات موجودة — جاهز."; else
      echo "⏬ تنزيل مكتبات ريموشن (~500 ميقا، مرة وحدة)…"
      ( cd "$R" && npm install --silent ) || { echo "❌ فشل التنزيل"; exit 12; }
      echo "✅ جاهز."
    fi ;;
  sync) sync_all ;;
  studio)
    sync_all; PORT="${ARG:-3000}"
    echo "🎬 الاستوديو على http://localhost:$PORT"
    ( cd "$R" && npx remotion studio --port "$PORT" ) ;;
  render|render-test)
    sync_all; OUT="${ARG:-$W/ad-final.mp4}"
    FR=(); [ "$CMD" = render-test ] && { [ -n "$4" ] || { echo "render-test <out.mp4> <بداية-نهاية بالفريمات>"; exit 2; }; FR=(--frames="$4"); }
    grep -q '"guides": true' "$R/src/project.json" && \
      echo "⚠️  أدلّة المنطقة الآمنة شغّالة — تنطبع بالفيديو. شيل guides من safe.json قبل التسليم."
    # ⛔ الصورة تُرندر صامتة بـPNG (القاعدتان ١٩ و٢٨)، والصوت يُلصق بعدها كما هو.
    SIL="$W/.remotion-silent.mp4"
    # ⛔ امسح الناتج القديم قبل الرندر: رندر فشل (ENOSPC — القرص امتلأ) وبقي ad-final.mp4 القديم، فانفحص وانسلّم
    #    على إنه الجديد (صارت فعلاً: نسخة مسلَّمة بالصورة القديمة). ويوقف لو القرص أقل من 25 قيقا.
    rm -f "$OUT" "$SIL"
    FREE=$(df -Pk "$W" | awk 'NR==2{print int($4/1048576)}')
    if [ "${FREE:-0}" -lt 25 ]; then echo "❌ القرص فيه ${FREE} قيقا بس — الرندر يحتاج ~20 (إطارات PNG). نظّف مجلدات remotion-webpack-bundle المؤقتة أولاً"; exit 3; fi
    # ⛔ جودة ثابتة ١٤ ميقابت — crf 18 خلّى ريموشن يضغط لـ٤٫٨ ميقابت (٢٤٪ من مصدر ٢٠) بمقطعين،
    #    لأن الخلفية الغامقة تنضغط بسهولة فينزل كل الإطار. قاعدة «لا تحت ثلث المصدر».
    # ⛔ --color-space bt709 إلزامي (القاعدة ٩٠): بدونه يرمّز بمصفوفة 601 بلا وسم، فكل مشغّل HD يفكّه غلط (ميل لوني شافه بعينه).
    ( cd "$R" && npx remotion render Ad "$SIL" --codec h264 --video-bitrate 14M --image-format png --muted --color-space bt709 "${FR[@]}" )
    if [ -f "$W/voice.wav" ]; then
      MIX="$W/voice.wav"
      if [ -f "$W/sfx.wav" ]; then
        MIX="$W/.remotion-mix.wav"
        ffmpeg -y -v error -i "$W/voice.wav" -i "$W/sfx.wav" \
          -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[a]" \
          -map "[a]" -c:a pcm_s24le -ar 48000 "$MIX"
      fi
      # الأوسمة كاملة داخل الستريم نفسه (primaries · transfer · matrix · range) — نسخ بلا إعادة ترميز
      ffmpeg -y -v error -i "$SIL" -i "$MIX" -map 0:v -map 1:a -c:v copy \
        -bsf:v "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0" \
        -c:a aac -b:a 256k -shortest "$OUT"
      rm -f "$W/.remotion-mix.wav"
    else
      echo "⚠️  ما فيه voice.wav — سلّمت الصورة بلا صوت"; cp "$SIL" "$OUT"
    fi
    rm -f "$SIL"
    echo "✅ $OUT"
    ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height -of default=nw=1 "$OUT"
    echo "— تحقّق إلزامي: قارن صوت الناتج بـvoice.wav (ارتباط ≥ 0.999) قبل التسليم."
    # ⛔ الفحصان بعد كل رندر (القاعدتان ١٩ و٩٠) — «رندر نجح» ما يعني «صورته وصوته سليمان»
    SK="$(cd "$(dirname "$0")" && pwd)"
    if [ "$CMD" = render-test ]; then
      A0="${4%-*}"; python3 "$SK/21_color_check.py" "$W" "$OUT" --at "$(python3 -c "print(round(($A0+30)/30,2))")" --offset "$(python3 -c "print(round($A0/30,3))")" || true
    else
      python3 "$SK/21_color_check.py" "$W" "$OUT" || echo "⛔ اللون تغيّر — لا تسلّم"
      [ -f "$W/voice.wav" ] && { python3 "$SK/20_voice_check.py" "$W" "$OUT" || echo "⛔ الصوت تغيّر — لا تسلّم"; }
    fi
    ;;
  *) echo "أوامر: setup | sync | studio | render"; exit 2 ;;
esac
