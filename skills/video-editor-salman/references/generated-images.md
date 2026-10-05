# الصور المولّدة (أي نموذج ذكاء اصطناعي للصور) — الخطوة الإضافية اللي تميّز المقطع

> قل له «نموذج ذكاء اصطناعي» — لا تسمّي برنامجاً معيّناً. هو يستعمل اللي عنده.

لو اختار بأسئلة البداية إنه يولّد صوراً: أنت تكتب البرومبتات، وهو يولّدها ويرجّعها لك.
الصور المولّدة تخلّي كل مشهد يمثّل كلامه بالضبط — بدل صورة ستوك قريبة من المعنى.

## الخطوات
1. **اقرأ السكربت وحدّد اللحظات** اللي تحتاج صورة (شي ملموس يقوله: شخص، مكان، غرض، موقف).
2. **اكتب رسالة مقدّمة واحدة** يلصقها أول شي بمحادثة جديدة — تثبّت الستايل لكل الصور.
3. **برومبت لكل صورة** — كامل، بالإنجليزي، داخل مربع كود يقدر ينسخه بضغطة. ⛔ لا تكتب «نفس اللي قبل بس…» بالعربي.
4. **يرجّع الصور** (يحطها بمجلد المقطع `assets/`، أو يرسلها بالمحادثة).
5. **افحص كل صورة بالدقة الكاملة** قبل الاستعمال: قيوده (القاعدة ١١) · ما فيها كتابة مخربطة أو شعار · تمثّل الكلام فعلاً.
6. **القص**: الصور اللي تنقص بلا خلفية تنطلب بخلفية سادة، وتنقص بـ`subjectcut.swift` (ماك) أو `rembg` (ويندوز).

## الرسالة المقدّمة (مثال لستايل كولاج — عدّله على أسلوبه)
```
I'm making a vertical (9:16) explainer video. I'll send you several image requests. Keep ONE consistent style for all of them:
Handmade paper-craft collage style, like a physical diorama made of cut paper, cardboard and vintage newspaper clippings. Realistic photographic lighting with soft shadows showing the paper layers. People are real-photo cutouts (black-and-white or muted vintage colors) with a thin white paper border. Warm muted palette: kraft brown, cream, faded red accents. Bright and clear, NOT dark, high contrast, the subject is large and instantly readable.
Rules for every image: NO text, letters, numbers, logos or brand names anywhere. Vertical 9:16.
"isolated" means a plain light-gray background. "the same man" means keep the same person across images.
```
أضف لها قيوده من ملفه (مثلاً: `ONLY adult men, no women anywhere, not even in the background`) لو عنده قيد.

## قواعد البرومبت لكل صورة
- **خلفية سادة** (رمادي فاتح أو كريمي) للي راح يُقص.
- **مشهد كامل** للي يُعرض ملء الشاشة.
- **لا كتابة داخل الصورة** — العربي يطلع مخربط، والكلام يُكتب بالكود.
- **قريب من جمهوره**: لو جمهوره خليجي، اطلب ملابس ومكان يشبههم.
- صورة جماعية؟ افحص كل وجه — أي شخص ممكن ينقرأ غلط حسب قيوده، شيله أو أعد التوليد.

## مثال برومبت صورة
```
Isolated on a plain light-gray background: a tired office worker slumped at a desk covered in paperwork, late at night, desk lamp glowing. Paper-craft collage style as described, vertical 9:16, no text.
```
