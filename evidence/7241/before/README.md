# #7241 BEFORE: v1→v2 import hijacks another repo's project (unmodified main @ a9dc569cdd)

Real dev desktop app driven over CDP (renderer on Vite port 4725, `RENDERER_REMOTE_DEBUG_PORT=9555`),
signed in as the seeded dev user, active org `a1b2c3d4-e5f6-7890-abcd-ef1234567890`.

## Starting state

- `~/tmp-7241/a`: git repo, `origin` → `git@github.com:fix7241/a.git`, worktree `a-worktrees/a-feature` (branch `a-feature`).
- `~/tmp-7241/b`: git repo, `origin` → `git@github.com:fix7241/b.git` **plus** remote `a` → `git@github.com:fix7241/a.git`,
  worktree `b-worktrees/feature` (branch `feature`). See `repos.txt`.
- Project **A** exists on this host: `project.create {importLocal, repoPath: ~/tmp-7241/a}` then
  `workspaceCreation.adopt` of `a-feature` → project `f4a10b9f-…` with workspaces `main` (`~/tmp-7241/a`) and
  `a-feature`. A cloud `v2_projects` row with `repo_clone_url = https://github.com/fix7241/a` was inserted for it
  (`cloud-v2-projects.txt`), which is what `findByPath`'s remote walk matches against.
- v1 `local.db`: one visible project **B** (`11111111-b000-…`, `main_repo_path = ~/tmp-7241/b`, `github_owner` NULL,
  exactly as in the report) with one v1 workspace/worktree (`feature`). Every other v1 project was hidden
  (`tab_order = NULL`) and the org's ledger rows cleared, so the run only touches B.
- Sanity probe before the run: `project.findByPath({repoPath: ~/tmp-7241/b, walkAllRemotes: true})` returned exactly one
  candidate, project A (`source: "remote"`), with nothing marking it as found through a non-origin remote.

## Steps

1. `00-sidebar-start.png`: project `a` in the sidebar with `local` + `a-feature`.
2. Open the v1 import wizard on the projects page (the Experimental settings entry is hidden for this account, so the
   wizard store was opened directly: `useV1ImportModalStore.getState().openModal("projects")`).
   `02-importer-projects.png`: row `b` offers **Link** (its lone candidate is A), "Import all · 1".
3. Click **Import all** → `03-import-all-relocate-prompt.png`: "Already set up at /Users/kietho/tmp-7241/a. Link to
   /Users/kietho/tmp-7241/b instead?" (host `setup` hit `rejectIfRepoint`; the prompt never says A is a different repo).
4. Click **Use this folder** (`allowRelocate: true`) → `04-after-use-this-folder.png`: row reads **Linked**.
5. **Next** → workspaces page (`05-workspaces-page.png`), **Adopt all** → B's `feature` adopted under A.
6. Cancel the wizard, Back to the sidebar → `06-sidebar-after-import.png`: project `a` now lists `local`, `feature`
   (B's) and `a-feature`.

## Result (the hijack)

- `host-db-projects-workspaces.txt`: project A's `repo_path` is now `/Users/kietho/tmp-7241/b`, `remote_name = a`;
  its `main` workspace was re-pointed to `/Users/kietho/tmp-7241/b`; B's `feature` worktree was adopted under A.
  `~/tmp-7241/a` no longer has any project row.
- `local-db-v1-ledger.txt`: ledger says B → A (`success`); B's workspace → A.
