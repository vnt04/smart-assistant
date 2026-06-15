#!/usr/bin/env python3
"""Verify every relative .md link under docs/ resolves. Prints "OK" or a list of broken links.

Run from repo root:
    python3 docs/_scripts/check_links.py
"""
import re
import pathlib

DOCS = pathlib.Path("docs").resolve()
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+\.md)((?:#[^)]*)?)\)")

broken = []
for md in DOCS.rglob("*.md"):
    for m in LINK_RE.finditer(md.read_text(encoding="utf-8")):
        link = m.group(2)
        if link.startswith(("http://", "https://", "/")):
            continue
        if not (md.parent / link).resolve().exists():
            broken.append((str(md.relative_to(DOCS)), link))

print(broken or "OK")
