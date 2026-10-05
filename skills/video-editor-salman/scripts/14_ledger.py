# -*- coding: utf-8 -*-
"""سجلّ المقاطع — يولّد LEDGER.md من mechanisms.json ويفحص تماسكه.

    python3 14_ledger.py                 # يعيد توليد السجل ويفحص
    python3 14_ledger.py --check         # يفحص فقط (للاستعمال قبل التسليم)

mechanisms.json هو المصدر الوحيد للحقيقة. بعد كل تسليم: أضف الآليات الجديدة فيه
(الرمز · الاسم · الدالة · «الشكل يقول ماذا») وأضف رموزها لقائمة المقطع، ثم شغّل هذا.
"""
import json, os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths
_paths.ensure()
M = _paths.load("mechanisms.json", _paths.EMPTY_LEDGER)
errs = []

known = set(M["mechs"])
for v in M["videos"]:
    for c in v["mechs"]:
        if c not in known: errs.append(f"المقطع {v['name']}: رمز غير معرّف {c}")
usage = collections.Counter(c for v in M["videos"] for c in v["mechs"])
for c, mm in M["mechs"].items():
    if usage[c] == 0: errs.append(f"الآلية {c} ({mm['ar']}) غير مستعملة بأي مقطع")

if errs:
    print("❌ السجل غير متماسك:"); [print("   " + e) for e in errs]
    if "--check" in sys.argv: sys.exit(1)

if "--check" not in sys.argv:
    o = ["# سجلّ مقاطعك", "",
         "> المصدر الوحيد `mechanisms.json`. **لا تحرّر هذا الملف بيدك** — شغّل `14_ledger.py`.",
         "> قبل تصميم أي مقطع جديد: اقرأ «الآليات» و«المرفوض» أولاً.", "",
         "## المقاطع", "", "| # | المقطع | التاريخ | المدة | آليات | حالة المشروع |", "|---|---|---|---|---|---|"]
    for v in M["videos"]:
        st = f"`{v['state']}`" if v.get("state") else "⚠️ نُظّفت"
        o.append(f"| {v['id']} | {v['name']} | {v['date']} | {v['dur']}ث | {len(v['mechs'])} | {st} |")
        if v.get("note"): o.append(f"| | *{v['note']}* | | | | |")
    o += ["", "## الآليات — الشكل وماذا يقول", "",
          "| رمز | الآلية | الشكل يقول | الدالة | استُعملت في |", "|---|---|---|---|---|"]
    for c, mm in M["mechs"].items():
        where = " · ".join(f"{w[0]}@{w[1]}" for w in mm.get("used", []))
        warn = "  \n" + mm["warn"] if mm.get("warn") else ""
        o.append(f"| **{c}** | {mm['ar']} | {mm['says']} | `{mm['fn']}` | {where}{warn} |")
    o += ["", "## ⛔ المرفوض — لا تقترحه ثانية", "",
          "| الشكل | ليش رُفض | مين رفضه | البديل |", "|---|---|---|---|"]
    for r in M["rejected"]:
        o.append(f"| {r['ar']} | {r['why']} | {r['by']} | {r.get('replaced','—')} |")
    if M.get("sounds"):
        S = M["sounds"]
        o += ["", "## المكتبة الصوتية", "", f"> {S['_']}", "",
              f"**مكتبته:** `{S['his_library']}`", "", "### قيد الاستعمال", "",
              "| الصوت | متى |", "|---|---|"]
        for k, v in S["in_use"].items(): o.append(f"| `{k}` | {v} |")
        o += ["", "### ⛔ محذوفة نهائياً — لا تُعاد", "", "| الصوت | ليش |", "|---|---|"]
        for k, v in S["deleted_forever"].items(): o.append(f"| `{k}` | {v} |")
        o += ["", f"**⚠️ حادّة الطيف — لا تستعملها فوق كلامه:** {S['spectral_watch']}"]
    o += ["", "## الأكثر تكراراً", ""]
    for c, k in usage.most_common(6):
        o.append(f"- **{c}** {M['mechs'][c]['ar']} — {k} مرات")
    open(_paths.data("LEDGER.md"), "w", encoding="utf-8").write("\n".join(o) + "\n")
    print(f"✅ LEDGER.md — {len(M['videos'])} مقاطع · {len(M['mechs'])} آلية · {len(M['rejected'])} مرفوضة")
