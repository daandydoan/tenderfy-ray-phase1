#!/usr/bin/env python3
"""Stamp every local .css/.js reference with ?v=<content hash>.

GitHub Pages sends no cache-busting headers, so a browser that has seen the
site once will happily keep running last week's ray-panel.js — which during
this build meant demoing a version that had already been fixed. The stamp is
derived from file contents, so it changes exactly when the file does and the
URL is stable across rebuilds that changed nothing.

Run before every deploy:  python3 stamp.py
"""
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
PAGES = list(ROOT.glob('*.html')) + list((ROOT / 'pages').glob('*.html'))
REF = re.compile(r'(?P<attr>href|src)="(?P<path>(?:\.\./)?(?:[\w./-]+)\.(?:css|js))(?:\?v=[0-9a-f]+)?"')

def digest(page, rel):
    target = (page.parent / rel).resolve()
    if not target.is_file():
        return None
    return hashlib.sha1(target.read_bytes()).hexdigest()[:8]

changed = []
for page in PAGES:
    text = original = page.read_text()
    def sub(m):
        d = digest(page, m.group('path'))
        if d is None:
            print(f'  ! {page.name}: {m.group("path")} not found', file=sys.stderr)
            return m.group(0)
        return f'{m.group("attr")}="{m.group("path")}?v={d}"'
    text = REF.sub(sub, text)
    if text != original:
        page.write_text(text)
        changed.append(page.relative_to(ROOT))

print(f'stamped {len(PAGES)} pages; rewrote {len(changed)}: '
      + (', '.join(str(c) for c in changed) or 'none'))
