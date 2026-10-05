# -*- coding: utf-8 -*-
"""المؤثرات الصوتية — مركّبة رياضياً، بلا أي ملف خارجي.  python3 05_sfx.py <workdir>

sfx.json = { "outro": 0, "<اسم الصوت>": [توقيتات...] }
الأسماء المتاحة مطبوعة بآخر التشغيل. الأصوات الدلالية (خطوات، حديد، طيران…)
تُربط بما يقوله المتحدث فعلاً، لا بأي انتقال.
"""
import wave, numpy as np, sys, os, json

S = os.path.abspath(sys.argv[1]) + "/"
SR = 48000
_c = json.load(open(S + "caps.json"))
_s = json.load(open(S + "sfx.json"))
DUR = _c["total"] + _s.get("outro", 0)
n = int(DUR * SR) + SR
buf = np.zeros(n)
rng = np.random.RandomState(11)

def T(d):            return np.arange(int(d * SR)) / SR
def norm(x):         return x / (np.max(np.abs(x)) + 1e-9)
def lp(x, a0, a1, n=1):
    """تمرير-منخفض بتردد متحرك. n = عدد المراحل — كل مرحلة تزيد حدّة الانحدار
    ٦ ديسيبل/أوكتاف. مرحلة وحدة ما تكفي للأصوات الغامقة (خطوات، طيران):
    الضجيج يتسرّب من فوق ويطلع الصوت حادّاً."""
    for _ in range(n):
        y = np.empty_like(x); z = 0.0
        for i in range(len(x)):
            a = a0 + (a1 - a0) * (i / len(x)); z += a * (x[i] - z); y[i] = z
        x = y
    return x
def partials(t, f0, ratios, decays, amps):
    """رنين معدني: توافقيات غير متناسقة، كل وحدة تخمد بسرعتها"""
    out = np.zeros(len(t))
    for r, d, a in zip(ratios, decays, amps):
        out += a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t / d)
    return out

# ────────────────────────── الانتقالات (الأساس) ──────────────────────────
def whoosh(dur=0.34, up=True):
    """⛔ النسخة الأولى كان مركز طيفها 7569 هرتز (صعوداً) و6270 (هبوطاً) — وهذي «الطنطنة»
       اللي اشتكى منها: نطاق الصفير فوق صوته مباشرة. قِسناها بالملف المركّب لا بالانطباع.
       العلاج: سقف تردّدي حاد. الووش صوت حركة لا نقرة، فتعتيمه ما يقتل وظيفته
       (بعكس الغالق — القاعدة ٦٩)."""
    t = T(dur); y = lp(rng.randn(len(t)), *((0.03, 0.30) if up else (0.30, 0.03)))
    y = lp(y, 0.055, 0.055)                     # ← السقف: يهبط المركز تحت ٣ كيلوهرتز
    body = lp(rng.randn(len(t)), 0.012, 0.012)
    # ⛔ الجسم المنخفض بلا مدخل تدريجي يرفع طاقة أول 30 م.ث فوق ٢٥٪ من الذروة،
    #    فيصنّفه _lead() نقرياً ويلغي تقديمه — وترجع البداية متأخرة ٦٦ م.ث.
    # ⛔ مفاضلة قِسناها: المدخل البطيء يجعل الذروة متأخرة فيُقدَّم الصوت، لكن **بدايته المسموعة**
    #    تظل بعد القطع (الحاكم ② يوقف التسليم عند +100 م.ث). والمدخل السريع يجعل البداية على القطع.
    #    القرار: الصعود يكون **طيفياً** (المرشّح يفتح) لا سعوياً — فالإحساس صاعد والبداية على الحدث.
    y = y + 0.5 * body
    if up:
        # ⛔ الغلاف `sin(πt/dur)^1.6` هو اللي كان يؤخّر البداية ٦٦ م.ث — لا مدخلي.
        #    قِسناها: الرقم ثابت مهما غيّرنا المدخل، فالعلّة بالغلاف نفسه.
        #    البديل: هجوم فوري ثم انحسار، والصعود يبقى **طيفياً** (المرشّح يفتح مع الزمن).
        env = (1 - np.exp(-t / 0.005)) * np.exp(-t / 0.135)
    else:
        # ⛔ الهبوط كان يحمل الغلاف الجَرَسي فتُقدَّم بدايته ١٢٩ م.ث قبل القطع — يُسمع
        #    «الصوت قبل الصورة». قِسناه بالملف المركّب. نفس علاج الصعود: هجوم على القطع.
        env = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.115)
    return norm(y * env)

def thud(f0=135, f1=58, dur=0.30):
    t = T(dur)
    f = f0 * np.exp(np.log(f1 / f0) * t / dur)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.085)
    s += lp(rng.randn(len(t)), 0.35, 0.05) * np.exp(-t / 0.006) * 0.35
    return norm(s)

def tap(dur=0.09):
    t = T(dur)
    s = lp(rng.randn(len(t)), 0.22, 0.05) * np.exp(-t / 0.013)
    return norm(s * np.minimum(1.0, t / 0.0012))

# ────────────────────────── الأصوات الدلالية ──────────────────────────
def steps(count=4, spm=176):
    """خطوات جري — إيقاع الجري الحقيقي ١٧٦ خطوة/دقيقة"""
    gap = 60.0 / spm
    out = np.zeros(int((gap * count + 0.25) * SR))
    for i in range(count):
        t = T(0.16)
        body = np.sin(2 * np.pi * 74 * t) * np.exp(-t / 0.035)          # ارتطام القدم
        grit = lp(rng.randn(len(t)), 0.10, 0.03, 3) * np.exp(-t / 0.022)  # احتكاك الأسفلت
        s = norm(body * 1.0 + norm(grit) * 0.35) * (0.78 if i % 2 else 1.0)  # قدم أخف من قدم
        j = int(i * gap * SR); out[j:j + len(s)] += s
    return norm(out)

def metal(dur=0.9):
    """دق الحديد — نسب غير متناسقة تعطي الرنين المعدني"""
    t = T(dur)
    s = partials(t, 210, [1, 2.76, 5.40, 8.93, 13.3], [0.42, 0.30, 0.20, 0.13, 0.08],
                 [1.0, 0.62, 0.44, 0.28, 0.16])
    s += lp(rng.randn(len(t)), 0.60, 0.20) * np.exp(-t / 0.004) * 0.5   # ضربة البداية
    return norm(s)

def jet(dur=1.30):
    """إقلاع طائرة — ضجيج عريض يرتفع تردده مع تصاعد"""
    t = T(dur)
    y = lp(rng.randn(len(t)), 0.004, 0.055, 2)
    swell = np.clip(t / (dur * 0.72), 0, 1) ** 1.5
    tail = 1 - np.clip((t - dur * 0.72) / (dur * 0.28), 0, 1) ** 2
    return norm(y) * swell * tail

def heartbeat(dur=0.72):
    """نبضة قلب — ضربتان (لَبْ-دَبْ)"""
    out = np.zeros(int(dur * SR))
    for off, amp, f in ((0.0, 1.0, 62), (0.26, 0.72, 54)):
        t = T(0.20)
        s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.048) * amp
        j = int(off * SR); out[j:j + len(s)] += s
    return norm(out)

def shutter(dur=0.18):
    """غالق كاميرا — نقرتان ميكانيكيتان بجسم.
    ⛔ كان مركزه ٥٦٨٢ هرتز = صفير. الغالق الحقيقي فيه خشب ومعدن تحت الكيلوهرتز،
    فأضفنا جسماً منخفضاً وقصصنا الحادّ (القاعدة ٥٥)."""
    out = np.zeros(int(dur * SR))
    for off, amp in ((0.0, 1.0), (0.055, 0.72)):
        t = T(0.055)
        s = lp(rng.randn(len(t)), 0.12, 0.03, 3) * np.exp(-t / 0.009) * amp
        s += np.sin(2*np.pi*380*t) * np.exp(-t / 0.012) * 0.55 * amp
        s += np.sin(2*np.pi*820*t) * np.exp(-t / 0.006) * 0.30 * amp
        # نقرة قصيرة جداً (٢ م.ث) ترجّع «الكلاك» بلا ما ترفع مركز الطيف فوق ٤ك
        s += lp(rng.randn(len(t)), 0.26, 0.09, 2) * np.exp(-t / 0.0022) * 0.55 * amp
        j = int(off * SR); out[j:j + len(s)] += s[:len(out)-j]
    return norm(out)

def coin(dur=0.85):
    """رنين معدني عالٍ — للمبالغ والأرقام"""
    t = T(dur)
    s = partials(t, 1180, [1, 1.78, 2.61, 3.9], [0.34, 0.24, 0.17, 0.10],
                 [1.0, 0.7, 0.45, 0.3])
    return norm(s * np.minimum(1.0, t / 0.0015))

def riser(dur=1.10):
    """تصاعد توتّر — قبل الكشف أو الرقم الكبير"""
    t = T(dur)
    f = 180 * np.exp(np.log(1500 / 180) * (t / dur) ** 1.6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.55
    s += lp(rng.randn(len(t)), 0.05, 0.40) * 0.8
    return norm(s) * (np.clip(t / dur, 0, 1) ** 2.2)

def typewrite(count=5, gap=0.075):
    """كتابة — نقرات متتابعة"""
    out = np.zeros(int((count * gap + 0.1) * SR))
    for i in range(count):
        t = T(0.03)
        s = lp(rng.randn(len(t)), 0.30, 0.10, 2) * np.exp(-t / 0.004)
        s *= 0.8 + 0.4 * rng.rand()
        j = int(i * gap * SR); out[j:j + len(s)] += s
    return norm(out)

def swipe(dur=0.22):
    """مسح سريع — لتبديل العناصر"""
    t = T(dur)
    y = lp(rng.randn(len(t)), 0.05, 0.45)
    return norm(y) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2.4

def ding(dur=0.70):
    """تأكيد ناعم — علامة صح، إنجاز"""
    t = T(dur)
    s = (np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1320 * t)) * np.exp(-t / 0.20)
    return norm(s * np.minimum(1.0, t / 0.002))


def paper(dur=0.55):
    """حفيف ورقة — دفعات ضجيج غير منتظمة زي ما تنقلب الصفحة"""
    t = T(dur); out = np.zeros(len(t))
    for _ in range(7):
        L = int((0.05 + 0.09 * rng.rand()) * SR)
        j = int(rng.rand() * (len(t) - L - 1))
        u = np.arange(L) / SR
        burst = lp(rng.randn(L), 0.26, 0.09, 3) * np.exp(-u / 0.030)
        out[j:j + L] += burst * (0.5 + 0.5 * rng.rand())
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.8
    return norm(out * env)

def write(strokes=5, gap=0.115):
    """خربشة قلم على ورق — ضربات قصيرة متتابعة"""
    out = np.zeros(int((strokes * gap + 0.18) * SR))
    for i in range(strokes):
        L = int((0.055 + 0.035 * rng.rand()) * SR)
        u = np.arange(L) / SR
        s = lp(rng.randn(L), 0.30, 0.12, 3)
        s *= np.sin(np.pi * np.clip(u / (L / SR), 0, 1)) ** 1.2   # ضغطة تبدأ وتنتهي
        j = int(i * gap * SR); out[j:j + L] += s * (0.7 + 0.5 * rng.rand())
    return norm(out)


def dread(dur=1.60):
    """رهبة — طبقة منخفضة تهبط مع همهمة: للحظات الخطر والموت"""
    t = T(dur)
    f = 118 * np.exp(np.log(34/118) * (t/dur)**0.75)
    s = np.sin(2*np.pi*np.cumsum(f)/SR)
    s += 0.5*np.sin(2*np.pi*np.cumsum(f*1.5)/SR)          # خامس غير متناسق = توتر
    s += lp(rng.randn(len(t)), 0.05, 0.012, 2) * 0.55      # هواء منخفض
    env = np.minimum(1.0, t/0.05) * (1 - np.clip((t-dur*0.55)/(dur*0.45),0,1)**1.6)
    return norm(s*env)


def ticker(count=14, dur=1.30):
    """عدّاد يتسارع — نقرات تتقارب وترتفع طبقتها مع صعود الرقم"""
    out = np.zeros(int((dur + 0.2) * SR))
    pos = 0.0
    for i in range(count):
        f = i / max(1, count - 1)
        gap = 0.16 * (1 - 0.72 * f) + 0.020
        L = int(0.030 * SR); u = np.arange(L) / SR
        tone = np.sin(2 * np.pi * (900 + 900 * f) * u) * np.exp(-u / 0.006)
        clk = lp(rng.randn(L), 0.40, 0.14, 2) * np.exp(-u / 0.004)
        s = norm(tone * 0.8 + clk * 0.6) * (0.55 + 0.45 * f)
        j = int(pos * SR)
        if j + L >= len(out): break
        out[j:j + L] += s; pos += gap
    return norm(out)

def cash(dur=0.95):
    """رنين نقود — عملات معدنية متتابعة"""
    out = np.zeros(int(dur * SR))
    for off, amp, f0 in ((0.0, 1.0, 1450), (0.075, 0.8, 1830), (0.155, 0.62, 1180)):
        t = T(0.62)
        s = partials(t, f0, [1, 1.71, 2.44, 3.6], [0.26, 0.18, 0.12, 0.08],
                     [1.0, 0.66, 0.42, 0.26]) * amp
        j = int(off * SR); e = min(len(out), j + len(s))
        out[j:e] += s[:e - j]
    return norm(out)

def drop(dur=0.85):
    """نغمة هابطة — رقم ينقص أو شيء يتراجع"""
    t = T(dur)
    f = 620 * np.exp(np.log(90 / 620) * (t / dur) ** 0.8)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    s += 0.35 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR)
    return norm(s * np.exp(-t / (dur * 0.42)))

def glass(dur=1.00):
    """ارتطام زجاج — للخطأ الذي دفع ثمنه"""
    t = T(dur)
    s = partials(t, 2100, [1, 1.63, 2.31, 3.17, 4.6], [0.16, 0.12, 0.09, 0.07, 0.05],
                 [1.0, 0.8, 0.62, 0.45, 0.3])
    s += lp(rng.randn(len(t)), 0.70, 0.30, 1) * np.exp(-t / 0.020) * 0.9   # التحطّم
    s += np.sin(2 * np.pi * 90 * t) * np.exp(-t / 0.05) * 0.5              # الجسم
    return norm(s)

def lock(dur=0.42):
    """قفل يُغلق — قرار حاسم"""
    out = np.zeros(int(dur * SR))
    for off, amp, f in ((0.0, 0.7, 320), (0.11, 1.0, 180)):
        t = T(0.16)
        s = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.022)
             + lp(rng.randn(len(t)), 0.16, 0.05, 3) * np.exp(-t / 0.010) * 0.55) * amp
        j = int(off * SR); out[j:j + len(s)] += s
    return norm(out)

def hookrise(dur=1.70):
    """توتر صاعد للهوك — يبدأ من الصفر ويشدّ"""
    t = T(dur)
    f = 60 * np.exp(np.log(680 / 60) * (t / dur) ** 1.9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.7
    s += 0.4 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    s += lp(rng.randn(len(t)), 0.02, 0.30, 2) * 0.9
    return norm(s) * (np.clip(t / dur, 0, 1) ** 2.4)


def clock(beats=6, bpm=60):
    """دقّات ساعة — للزمن والسنوات تمرّ"""
    gap = 60.0 / bpm
    out = np.zeros(int((gap * beats + 0.3) * SR))
    for i in range(beats):
        t = T(0.09)
        # تكّة خشبية: طقّة مكتومة فوق جسم خشبي منخفض
        tick = lp(rng.randn(len(t)), 0.115, 0.048, 3) * np.exp(-t / 0.005)
        body = np.sin(2 * np.pi * (1320 if i % 2 else 1080) * t) * np.exp(-t / 0.010)
        sgl = norm(tick * 0.55 + body * 1.0) * (1.0 if i % 2 == 0 else 0.82)
        j = int(i * gap * SR); out[j:j + len(sgl)] += sgl
    return norm(out)

def breath(dur=2.30):
    """نفس عميق — شهيق ثم زفير. للرئة والصحة."""
    t = T(dur); h = len(t) // 2
    air = lp(rng.randn(len(t)), 0.030, 0.11, 2)
    inh = np.sin(np.pi * np.arange(h) / h) ** 1.4            # شهيق يصعد
    exh = np.sin(np.pi * np.arange(len(t) - h) / (len(t) - h)) ** 1.9 * 0.8
    env = np.concatenate([inh, exh])
    return norm(air * env)

def ecg(beats=4, bpm=64):
    """نبض جهاز مراقبة القلب — نغمة قصيرة نظيفة تتكرر"""
    gap = 60.0 / bpm
    out = np.zeros(int((gap * beats + 0.3) * SR))
    for i in range(beats):
        t = T(0.12)
        s = np.sin(2 * np.pi * 980 * t) * np.exp(-t / 0.018)
        s *= np.minimum(1.0, t / 0.0015)
        j = int(i * gap * SR); out[j:j + len(s)] += norm(s)
    return norm(out)

def engine(dur=1.60):
    """محرك يحاول يشتغل ويتعثّر — لتشبيه السيارة بالورشة"""
    t = T(dur)
    out = np.zeros(len(t))
    pos = 0.0
    while pos < dur - 0.34:                     # محاولات إدارة متعثّرة
        L = int(0.30 * SR); u = np.arange(L) / SR
        f = 38 + 22 * np.sin(2 * np.pi * 7.5 * u)
        ph = 2 * np.pi * np.cumsum(f) / SR
        crank = (np.sin(ph) + 0.45 * np.sin(2 * ph)) * np.exp(-u / 0.16)
        crank += lp(rng.randn(L), 0.010, 0.004, 3) * np.exp(-u / 0.10) * 0.35
        j = int(pos * SR); e = min(len(out), j + L)
        out[j:e] += norm(crank)[:e - j]
        pos += 0.40
    return norm(out)

def reveal(dur=0.85):
    """نغمة كشف صاعدة قصيرة — للحظة الفهم (غير hookrise الطويل)"""
    t = T(dur)
    s = np.zeros(len(t))
    for i, r in enumerate([1.0, 1.5, 2.0]):     # ثلاث نغمات متصاعدة
        d = i * 0.11
        m = t >= d
        u = t[m] - d
        s[m] += np.sin(2 * np.pi * 520 * r * u) * np.exp(-u / 0.20) * (1.0 - i * 0.22)
    return norm(s * np.minimum(1.0, t / 0.004))

# اسم الصوت ← (المولّد، قوّته)  — القوّة مضبوطة عشان الذروة تبقى تحت ‎-18 dBFS
def _load(path):
    """يحمّل مؤثراً من مكتبة صانع المحتوى نفسه (wav/mp3/aiff).
       يوحّد 48k أحادي · يشيل الصمت من أوله · يعاير الذروة لـ1.0.
       ⛔ قِس مركز طيفه مقابل مداه الطبيعي قبل ما تعتمده — الاسم مو ضمانة."""
    import subprocess, tempfile, os as _os
    t = tempfile.mktemp(suffix=".wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path,
                    "-ac", "1", "-ar", str(SR), t], check=True)
    w = wave.open(t); x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32768.0
    w.close(); _os.unlink(t)
    nz = np.where(np.abs(x) > 0.004)[0]                 # قصّ الصمت الأمامي
    if len(nz): x = x[max(0, nz[0] - int(0.002 * SR)):]
    # ⛔ سقف الطول: المؤثر الطويل يقعد تحت كلامه ويزاحمه. المستخدم قالها:
    #    «أصواتها عالية وطويلة بعضها، لا تطغى على صوتي». قِسنا gears: 1.61ث مسموعة.
    cap = int(float(_os.environ.get("SFX_MAX", "0.90")) * SR)
    if len(x) > cap:
        x = x[:cap].copy()
        f = int(0.10 * SR)                              # تلاشٍ ناعم بدل قطع حاد
        x[-f:] *= np.linspace(1, 0, f)
    return norm(x)


def _lib(S_dir):
    """كل ملف بـ<work>/lib/ يصير مؤثراً باسم الملف بلا امتداد."""
    import glob as _g, os as _os
    out = {}
    for f in sorted(_g.glob(_os.path.join(S_dir, "lib", "*"))):
        if _os.path.splitext(f)[1].lower() in (".wav", ".mp3", ".aiff", ".m4a", ".aif"):
            out[_os.path.splitext(_os.path.basename(f))[0]] = _load(f)
    return out


def _lead(x):
    """كم يتأخّر أعلى صوت المؤثر عن بدايته — الووش صعودٌ فذروته بآخره.
       نطرحها من التوقيت عشان اللي يُسمع يوافق الحركة، لا اللي يبدأ."""
    e = np.abs(x)
    w = max(1, int(0.010 * SR))
    e = np.convolve(e, np.ones(w) / w, "same")
    pk = e.max()
    # ⛔ الصوت النقري (غالق · نقرة · ضربة) بدايته هي ضربته — تقديمه يخليه يسبق الحدث.
    #    الغالق ذروته بعد 132 م.ث (النقرة الثانية)، وتقديمه خلّاه يطلع قبل الصورة والمستخدم سمعها.
    #    نقدّم فقط الأصوات اللي تبني طاقتها تدريجياً (الووش والرايزر).
    if (e[: int(0.030 * SR)] > pk * 0.25).any():
        return 0.0
    return min(0.35, float(np.argmax(e)) / SR)


# ────────────────── أصوات منخفضة الطيف (بديلة للحادّة) ──────────────────
# ⛔ الدرس: ثمانية من ١٧ مؤثراً كان مركز طيفها فوق ٣٫٥ كيلوهرتز — كلها في نطاق
#    الصفير فوق صوت المتحدث مباشرة، فسمعها «طنطنة». الميزانية الآن: مؤثران
#    فوق ٤ كيلوهرتز في الدقيقة كحد أقصى، والباقي تحتها.
# ⛔ knock وcountdown ينسمعان «طفوليين» — لا تستعملهما إلا لو طلبهما.

def pip(dur=0.10):
    """نقرة ناعمة لظهور عنصر — تحت الكيلوهرتز عمداً (بديلة tap/type)."""
    t = T(dur)
    s = np.sin(2*np.pi*620*t) * np.exp(-t/0.020) + 0.5*np.sin(2*np.pi*930*t) * np.exp(-t/0.012)
    s += lp(rng.randn(len(t)), 0.10, 0.02, 2) * np.exp(-t/0.003) * 0.25
    return norm(s * np.minimum(1.0, t / 0.0006))

def chaindrag(dur=0.58):
    """سحب سلسلة معدنية ثقيلة — حلقات تحتك وتتسارع ثم تشتدّ."""
    t = T(dur); out = np.zeros(len(t))
    for k in range(11):
        st = int((0.02 + k*0.046) * SR)
        if st >= len(t): break
        e = T(0.09)
        g = partials(e, 540 + rng.randint(-90, 90), [1, 1.86, 2.9],
                     [0.020, 0.013, 0.008], [1, 0.5, 0.3])
        g = g * np.exp(-e/0.016) * (0.32 + 0.68*k/10)
        out[st:st+len(g)] += g[:len(out)-st]
    out += lp(rng.randn(len(t)), 0.16, 0.05, 2) * np.exp(-t/0.20) * 0.30
    return norm(out)

# ⛔ التتابع = صوت واحد فيه تكرار داخلي، لا عدة مؤثرات بأوقات مكتوبة بالإيد.
#    خمس نقرات موضوعة يدوياً أعطت ٦ أزواج متقاربة و٧ انحرافات فوق ١٢٠ م.ث.
def deletes(count=4, gap=0.30):
    """تتابع حذف — نقرات هبوطية داخل صوت واحد."""
    out = np.zeros(int((gap*count + 0.25) * SR))
    for i in range(count):
        d = T(0.13); f = 520 * (0.86 ** i)
        x = np.sin(2*np.pi*f*d) * np.exp(-d/0.030)
        x += lp(rng.randn(len(d)), 0.12, 0.03, 2) * np.exp(-d/0.006) * 0.35
        st = int(i*gap*SR); out[st:st+len(x)] += norm(x) * (0.95 - 0.12*i)
    return norm(out)

def yearroll(count=3, gap=0.50):
    """عدّاد سنوات — ثلاث تكّات داخل صوت واحد بدل ثلاثة مؤثرات مكتوبة بالإيد."""
    out = np.zeros(int((gap*count + 0.25) * SR))
    for i in range(count):
        x = ticker()
        st = int(i*gap*SR); out[st:st+len(x)] += x[:len(out)-st] * (1.0 - 0.10*i)
    return norm(out)

def pulserun(dur=0.92):
    """نبض قلب يتسارع ثم يسكت — بديل العدّ التنازلي. أعمق شي بالمكتبة (~٢٤٠ هرتز)،
       والتسارع نفسه هو التوتّر: ما يحتاج دقّات حادّة تشدّ الأذن."""
    out = np.zeros(int((dur + 0.40) * SR)); k = 0; t0 = 0.0
    while t0 < dur:
        b = T(0.16)
        x = np.sin(2*np.pi*62*b) * np.exp(-b/0.045) + 0.55*np.sin(2*np.pi*118*b) * np.exp(-b/0.028)
        x = norm(x) * (0.48 + 0.52 * t0 / dur)
        st = int(t0 * SR); out[st:st+len(x)] += x[:len(out)-st]
        k += 1; t0 += 0.30 * (0.78 ** k) + 0.055
    return norm(out)


BANK = {
    # ⛔ الكسب مضبوط بالقياس لا بالأذن: ذروة المؤثر مقابل RMS كلامه، الهدف +٦ إلى +٧ dB (القاعدة ٧٠)
    "whoosh_up":  (whoosh(0.34, True),  0.300),
    "whoosh_down":(whoosh(0.30, False), 0.270),
    "thud":       (thud(),              0.33),
    "tap":        (tap(),               0.170),
    "steps":      (steps(),             0.210),
    "metal":      (metal(),             0.190),
    "jet":        (jet(),               0.170),
    "heartbeat":  (heartbeat(),         0.240),
    "shutter":    (shutter(),           0.32),   # ⛔ ٠٫١٩ خلّاه ‎−١٧ dB تحت صوته = مكتوم
    "coin":       (coin(),              0.160),
    "type":       (typewrite(),         0.29),
    "swipe":      (swipe(),             0.170),
    "ding":       (ding(),              0.3),
    "paper":      (paper(),             0.260),
    "write":      (write(),             0.260),
    "dread":      (dread(),             0.240),
    "ticker":     (ticker(),            0.43),
    "cash":       (cash(),              0.150),
    # ⛔ drop وriser محذوفان من السجلّ نفسه — لا تعيدهما بأي مقطع.
    #    استعملت drop عند «وهم» فسمعه طفولياً ثانيةً: «مازال الصوت الطفولي يطلع مع كلمة وهم».
    "glass":      (glass(),             0.3),
    "lock":       (lock(),              0.220),
    "hookrise":   (hookrise(),          0.130),
    "pip":        (pip(),               0.3),
    "chaindrag":  (chaindrag(),         0.175),
    "deletes":    (deletes(),           0.165),
    "pulserun":   (pulserun(),          0.200),
    "yearroll":   (yearroll(),          0.150),
    "breath":     (breath(),            0.170),
    "ecg":        (ecg(),               0.130),
    "engine":     (engine(),            0.180),
    "reveal":     (reveal(),            0.3),
}

# مؤثرات صانع المحتوى من <work>/lib/ — تُضاف للبنك وتغلب المصنَّع لو تشابه الاسم
LIBSET = set()
for _k, _v in _lib(S).items():
    BANK[_k] = (_v, 0.240)   # ⛔ 0.170 خلّى نقرته +3.8 dB فقط فوق كلامه — النقرة تحتاج +6
    LIBSET.add(_k)
    print(f"   ↳ من مكتبته: {_k}")

LEADS = {}          # كم قُدّم كل صوت — يقرأها 05b_sfx_audit فما يحسب التقديم خطأً
used, unknown = [], []
for key, times in _s.items():
    if key == "outro" or not isinstance(times, list):
        continue
    if key not in BANK:
        unknown.append(key); continue
    sig, g = BANK[key]
    for t0 in times:
        # ⛔ التوقيت المكتوب = لحظة الحركة على الشاشة. نقدّم الصوت بمقدار مهلته
        #    عشان تُسمع الذروة مع الحركة. بدونها الووش يتأخّر ١٨٤ م.ث ويحسّها المستخدم «مو متناغمة».
        i = max(0, int((t0 - _lead(sig)) * SR)); j = min(n, i + len(sig))
        buf[i:j] += sig[:j - i] * g
    LEADS[key] = round(float(_lead(sig)), 4)
    used.append(f"{key}×{len(times)}")

buf = np.clip(buf, -0.95, 0.95)
pcm = (buf * 32767).astype('<i2')
st = np.repeat(pcm[:, None], 2, axis=1).ravel()
w = wave.open(S + "sfx.wav", "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes(st.tobytes()); w.close()
json.dump({"leads": LEADS, "lib": sorted(LIBSET)}, open(S + "sfx.lead.json", "w"), ensure_ascii=False, indent=1)

peak = float(np.max(np.abs(buf)))
dbfs = 20 * np.log10(peak) if peak > 0 else -99
total = sum(len(v) for k, v in _s.items() if k != "outro" and isinstance(v, list))
print(f"✅ {total} مؤثر — {', '.join(used)}")
# الانتقالات تتعب الأذن بالتكرار؛ الأصوات الدلالية مربوطة بكلامه فما تتعب — لكل وحدة حدّها
TRANS = {"whoosh_up","whoosh_down","swipe","tap","thud","riser","ding"}
tr_n = sum(len(v) for k, v in _s.items() if k in TRANS and isinstance(v, list))
mins = DUR / 60
print(f"   الذروة {dbfs:.1f} dBFS ({'سليمة' if -20 <= dbfs <= -9 else '⚠️ خارج المدى — المفروض بين -20 و -9'})")
print(f"   انتقالات {tr_n/mins:.0f}/دقيقة ({'سليمة' if tr_n/mins <= 10.4 else '⚠️ المفروض ≤ ١٠ — التكرار يتعب'})"
      f" · الإجمالي {total/mins:.0f}/دقيقة ({'سليم' if total/mins <= 20 else '⚠️ المفروض ≤ ٢٠'})")
if unknown:
    print("⚠️ أسماء غير معروفة:", unknown)
print("   المتاح:", " · ".join(BANK))
