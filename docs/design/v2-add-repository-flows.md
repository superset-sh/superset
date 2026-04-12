# V2 Add Repository — Entry Point Design

Maps the different starting points for the "Add Repository" flow and picks a primary path.

## Decision Matrix

| # | Starting Point | User Intent | Has Cloud Project? | Has Local Repo? | What Needs to Happen |
|---|---|---|---|---|---|
| 1 | **Import existing local repo** | "I have this repo on disk, use it" | Maybe | Yes | Find or create cloud project, link local path |
| 2 | **Set up cloud project locally** | "I created a project in Superset, point it to my checkout" | Yes | Yes (not linked) | Validate git remote match, link path |
| 3 | **Clone cloud project** | "I created a project in Superset, clone it for me" | Yes | No | Clone to chosen dir, link path |
| 4 | **Fresh project from scratch** | "Start a new repo" | No | No | Create repo, create cloud project, link — **stub for now** |

## Current Coverage

- `project.setup` host-service endpoint handles **#2** and **#3** (given `projectId`, import or clone)
- `AddRepositoryDialog` covers **#2** and **#3** via project picker
- Pending-page fallback covers **#2** and **#3**
- **#1 is not built** — the "I have a repo, figure out which project it belongs to" flow
- **#4 is deferred**

## Design Options for #1

### Option A — Browse first, match after *(recommended)*

```
User clicks "Add Repository"
  → Browse for a local directory
  → Run git remote -v, parse owner/repo
  → Look up v2Projects by matching githubRepository
  → Match found → auto-select project, call project.setup(import)
  → No match → offer to create cloud project (stub) or pick manually
```

**Pros:** Most natural for the "I have a repo" mental model. One click once the path is picked.
**Cons:** Needs disambiguation logic if multiple cloud projects match (forks).

### Option B — Pick project first, browse after *(current)*

```
User clicks "Add Repository"
  → Pick project from dropdown
  → Browse OR clone
  → Validate remote matches
```

**Pros:** Simple, no ambiguity. Already built.
**Cons:** Backwards if user is starting from "I have this repo."

### Option C — Two entry modes

Dialog has two tabs:
- **From local directory** (Option A)
- **From project** (Option B)

**Pros:** Covers both mental models.
**Cons:** More surface area.

## Decision: Option A primary, Option B as fallback

**Rationale:** The sidebar "Add Repository" button is an action taken when a user already has a repo on disk. If they wanted to create a project first, they'd use a different entry (Phase 3 "New Project"). So the natural flow is: browse → match → link.

### UI Sketch

```
┌─────────────────────────────────────────┐
│  Add Repository                         │
│                                         │
│  [~/work/my-project        ] [Browse]   │
│                                         │
│  → github.com/org/my-project            │
│  → Matches project "My Project"    ✓    │
│                                         │
│              [Add Repository]           │
│                                         │
│  ─────── or ────────                    │
│  Set up a cloud project manually ↗      │
│  Create new project (stub) ↗            │
└─────────────────────────────────────────┘
```

### Flow

1. **Browse** — electron `selectDirectory` picker
2. **Inspect** — new host-service endpoint `project.inspectLocalPath({ localPath })` returns `{ gitRoot, remotes: [{ owner, name }] }`
3. **Match** — client-side lookup: scan `v2Projects` + `githubRepositories` collections for a project whose repo matches any extracted remote
4. **Resolve**
   - Single match → show "Matches project X" + Add button → call `project.setup({ mode: "import", projectId: matchedId, localPath })`
   - Multiple matches → dropdown to disambiguate
   - No match → show "No matching project found" + link to manual setup (Option B UI) + link to create-new stub

### Fallback Links

- **"Set up a cloud project manually"** → switches dialog to the current project-picker UI (Option B)
- **"Create new project"** → stub button; disabled or toasts "coming soon"

## Endpoint Additions

### `project.inspectLocalPath`

```ts
project.inspectLocalPath({
  localPath: string,
}) → {
  gitRoot: string,
  remotes: Array<{ name: string, owner: string, repoName: string }>,
}
```

Uses existing `getGitHubRemotes` util. Throws if path isn't a git repo.

No change to `project.setup` — the Option A flow just calls it with the matched `projectId`.

## Phasing

1. **Phase A** — Add `project.inspectLocalPath` endpoint
2. **Phase B** — Rewrite `AddRepositoryDialog` to browse-first with auto-match
3. **Phase C** — Keep the project-picker UI as "Set up a cloud project manually" fallback link
4. **Phase D (deferred)** — "Create new project" entry (covers #4 + no-match case in #1)

## Edge Cases

- **Multiple GitHub remotes (origin + upstream):** match any, prefer origin
- **Repo with no GitHub remote:** show "No GitHub remote found — use manual setup" fallback
- **Multiple v2Projects matching same repo:** dropdown to pick (rare but possible with forks)
- **Repo already set up:** `project.setup` is an upsert — re-running just re-points the path, safe
