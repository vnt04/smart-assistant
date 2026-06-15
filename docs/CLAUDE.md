# Docs — CLAUDE.md

Auto-loaded when editing files under `docs/`. Defer to the root [`CLAUDE.md`](../CLAUDE.md) for repo-wide rules. This file is the **editing contract** for documentation.

## Always do this FIRST

- The master index is [`architecture.md`](architecture.md) — start there for any cross-cutting change, and add a link there when you create a new module/platform/infra doc.
- Every module/platform/infra README is generated from [`_template/MODULE_TEMPLATE.md`](_template/MODULE_TEMPLATE.md).

## Editing rules

1. **Follow the template.** Every README under `modules/`, `platforms/`, `infra/` uses [`_template/MODULE_TEMPLATE.md`](_template/MODULE_TEMPLATE.md) with its section order **unchanged**.
2. **Paths inside a doc are absolute repo-relative** — e.g. `apps/backend/src/notes/notes.service.ts`, `packages/shared/src/notes.ts` — never relative to the docs folder.
3. **Cross-links between docs use relative markdown paths.** From `modules/<X>/README.md` (and identically from `platforms/<X>/` and `infra/<X>/`, all at depth `docs/<cat>/<name>/`):
   - Root guide → `../../../CLAUDE.md`
   - Architecture index → `../../architecture.md`
   - Cross-cutting arch → `../../architecture/{backend,frontend,database,security,overview}.md`
   - Another module → `../../modules/<name>/README.md`
   - A platform → `../../platforms/<name>/README.md`
   - An infra doc → `../../infra/<name>/README.md`
   - Existing feature/API docs → `../../features/notes/overview.md`, `../../api/notes.md`
4. **Never invent content.** If a fact is not verified in code, write `TODO: confirm <what>` instead of guessing.
5. **Every edit adds a Document History row:** `| YYYY-MM-DD | one-line change | author |`.
6. **Status banner is the first line** of every doc: `Verified` · `Draft — generated from code survey on YYYY-MM-DD` · `Needs review`.
7. **Prohibited:**
   - Mixing a third language. The repo convention is **English section headings + Vietnamese prose** — keep it consistent (the agent-facing `CLAUDE.md` files stay fully English).
   - Decorative emoji in headings.
   - "Production Ready" / "v1.0.0" marketing banners.
   - **New orphan docs at `docs/*.md`.** Everything except `architecture.md` and `CLAUDE.md` must live in a subfolder. (Pre-existing top-level docs — `README.md`, `SRS.md`, `setup.md` — are grandfathered; do not add more.)
8. **Run the link verifier** after any structural change (below).

## Link verifier

Checks that every relative `.md` link under `docs/` resolves. Run from repo root:

```bash
wsl.exe -d Ubuntu bash -lic 'cd /home/ubuntu/workspace/2026_projects/smart-assistant && python3 docs/_scripts/check_links.py'
```

`docs/_scripts/check_links.py`:

```python
import re, pathlib
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
```

## After editing — required

1. Keep the touched doc compliant with the template + rules above.
2. Append a Document History row.
3. Run the link verifier; it must print `OK`.
