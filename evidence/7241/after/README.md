# #7241 AFTER: same harness, with the fix (this branch)

Same starting state as `../before/README.md` (host.db project A reset to `~/tmp-7241/a` / `origin`, B's adopted
workspace removed, ledger cleared, v1 rows and cloud row unchanged), dev stack restarted so the host-service bundle
carries the fix. Same renderer/CDP ports.

## Steps and what changed

1. `project.findByPath({repoPath: ~/tmp-7241/b, walkAllRemotes: true})` now returns the same lone candidate A but
   marked `viaOrigin: false`, with `hasOriginRemote: true` on the result.
2. `00-sidebar-start.png`: project `a` with `local` + `a-feature`.
3. Open the wizard on the projects page → `02-importer-projects.png`: **"Import all" is gone** (B is no longer in the
   batch; `decideProjectImport` → `skip / non-origin-only`). The row still offers a manual **Link**.
4. Headless pass (`runV1Migration`, the boot-time auto-migration path) → `local-db-v1-ledger.txt` (1): B recorded as
   `skipped / non-origin-only`, A untouched, nothing mutated on the host.
5. Host backstop, `setup-guard.json`: the exact `project.setup` call the old "Use this folder" made
   (`mode: import, repoPath: ~/tmp-7241/b`, project A) is refused with `CONFLICT` both with and without
   `allowRelocate` — "`…/b` is a checkout of git@github.com:fix7241/b.git (origin), not fix7241/a".
6. Click the row's manual **Link** → `03-after-link-click.png`: `importV1Project` no longer links implicitly to a
   secondary-remote-only candidate; B becomes its **own** project (`2003e055-…`, `~/tmp-7241/b`, `origin` =
   fix7241/b). Ledger (2): B → `2003e055-…` success.
7. **Next**, **Adopt all** → `04-workspaces-adopted.png`: B's `feature` adopted under B.
8. `05-sidebar-after-import.png`: `b` (`local`, `feature`) and `a` (`local`, `a-feature`) side by side.

## Result

`host-db-projects-workspaces.txt`: A still at `/Users/kietho/tmp-7241/a` (`origin`, github.com/fix7241/a) with its
`main` and `a-feature` workspaces; B is a separate project at `/Users/kietho/tmp-7241/b` with `main` and `feature`.
