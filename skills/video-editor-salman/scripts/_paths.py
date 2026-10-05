# -*- coding: utf-8 -*-
"""مسارات المهارة وبيانات المستخدم — مكان واحد يعرّفها للكل.

SKILL : مجلد المهارة نفسه (للقراءة فقط — ما نكتب فيه شي).
HOME  : مجلد بيانات المستخدم. كل شي يخصّه ينحفظ هنا ويبقى بين المقاطع:
        profile.json (هويته) · voice.md (لغته) · mechanisms.json + LEDGER.md (سجل آلياته)
        dialect.json (لهجته) · sounds/ (مكتبة أصواته) · refs/ (مراجعه) · tools/ (أدوات منزّلة)
        الافتراضي: ~/Documents/video-editor-salman — ويتغيّر بمتغيّر البيئة VEB_HOME.
"""
import os, json
SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.environ.get("VES_HOME") or os.environ.get("VEB_HOME") or os.path.join(os.path.expanduser("~"), "Documents", "video-editor-salman")

def ensure():
    for d in ("", "sounds", "refs", "tools"):
        os.makedirs(os.path.join(HOME, d), exist_ok=True)
    return HOME

def data(*p):
    return os.path.join(HOME, *p)

def load(name, default):
    p = data(name)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)

EMPTY_LEDGER = {"videos": [], "mechs": {}, "rejected": [], "sounds": {}}
