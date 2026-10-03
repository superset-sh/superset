# Workspace teleport: moving a workspace between devices in one click

Status: exploration, 2026-09-25. Nothing built. Written to be argued with.
Updated 2026-09-30 against Herdr's shipped Teleport (see "A working implementation").

The ask: click one thing on the laptop, and the workspace — its files (including the
uncommitted ones), its agent conversations, its terminals, its layout — is open and running
on the desktop, or in the cloud, or back down again. Fast, git-fast.

## What a workspace actually is

Several kinds of state live under one row in the host's `workspaces` table, and they have
nothing in common except the directory they share.

| Layer | Where it lives | Size | Movable as bytes? |
| --- | --- | --- | --- |
| Committed history | `.git` | large, already replicated | yes, and both ends usually already have ~all of it |
| Dirty state: worktree, index, untracked, stashes | working tree | KBs–MBs | yes, and this is the whole problem |
| Ignored-but-precious: `.env`, `.envrc`, local configs | working tree, gitignored | KBs | yes, and nothing else can reproduce them |
| Derived: `node_modules`, `.venv`, build caches | working tree, gitignored | GBs | **no** — reproduce, never ship |
| Session: agent context, terminal scrollback, bindings, pane layout | host SQLite, renderer localStorage, and the harness's own store | KBs | **already solved** — see below |
| Running processes: dev server, live agent | kernel | — | no (see CRIU, below) |

The interesting consequence: everything worth moving is either already in a git object
graph or small enough to put into one. That is the design.

## The mechanism: a handoff *is* a commit

Build a commit that captures the dirty state, push it to the other device, restore from it.
Nothing more exotic than that — but doing it properly gets all of git's machinery for free:
content addressing (a file that hasn't changed since the last handoff doesn't move),
delta compression, pack negotiation (only objects the destination lacks cross the wire),
atomicity (a ref either exists or doesn't), and resumability.

### Source side

```
# the dirty state, without touching the user's index or worktree
STASH=$(git stash create)                       # HEAD + index tree + untracked tree, no refs moved
git stash export --to-ref refs/superset/handoff/<id>   # git 2.51+, the stash stack as a commit chain
```

`git stash create` writes a commit whose parents are HEAD, a commit of the index, and (with
untracked included) a commit of the untracked files — without mutating the worktree, the
index, or `refs/stash`. Git 2.51 then added `stash export`/`stash import`, which turn the
whole stash stack into a chain of commits "which can be transferred using the normal fetch
and push mechanisms". That is exactly this feature's primitive, shipped upstream last year.

Two things `stash` deliberately won't carry, which we add as extra trees in the same commit:

- **Ignored-but-precious files.** An allowlist (`.env*`, `.envrc`, `.dev.vars`, plus a
  per-project list in `.superset/config.json`), hashed with `git hash-object` into a side
  tree at `.superset/handoff/env/`. Without these the destination boots a workspace that
  can't talk to anything.
- **The manifest** (below), at `.superset/handoff/manifest.json`: workspace metadata, the
  terminal/binding list, scrollback tails, pane layout, and one handoff prompt per live
  agent session.

So one ref, one object graph, one atomic unit — and on a repeated handoff, only the blobs
that actually changed since the last one cross the wire.

### Transport

Three options, in preference order:

1. **Device to device over the relay we already run.** `apps/relay` already multiplexes
   streams from a client to a host's `host-tunnel`, and host-service already runs an HTTP
   server behind `PskHostAuthProvider` (or the gate ticket, for a sandbox). Mount git's
   smart-HTTP protocol v2 (`git http-backend`) at `/git/:workspaceId`, and the destination
   runs a plain `git fetch` against the relay URL. The code never touches a third party,
   negotiation means a typical handoff is the changed blobs only, and auth/addressing are
   solved already.
2. **Park it.** Source can't stay awake (lid closing is the *normal* case for "move to my
   desktop"): a bundle, or an encrypted blob in `apps/usercontent`, that the destination
   pulls when it wakes. Client-side encryption is not optional here — the payload carries
   `.env` files and the agents' handoff context. Build the bundle against the destination's
   *tips*, not a merge-base — see the recipe below; it recovers pack-negotiation-grade
   minimality over a transport that has no negotiation.
3. **A hidden ref on `origin`.** `git push origin refs/superset/handoff/<id>` — invisible in
   GitHub's branch UI, no PR, no pollution. Cheapest to build and works everywhere the
   project already pushes. But it puts the user's uncommitted work and secrets on their
   forge, so it should be opt-in per project, never the default. (Verify GitHub accepts
   pushes into a custom top-level ref namespace before relying on it.)

### Destination side

1. Ensure a clone of the project exists (else clone), cut the worktree at the same branch —
   `workspaceCreation.adopt` / the worktree create path already does this.
2. `git fetch <transport> refs/superset/handoff/<id>`.
3. Restore: check out the worktree tree, `read-tree` the index tree, write back untracked
   files and the env allowlist, `git stash import` the rest of the stack.
4. Reapply `projects.sparse_checkout_paths` *before* the restore, or the checkout "deletes"
   half the repo.
5. Run the workspace's setup scripts in a visible terminal (`createTerminalSessionInternal({
   initialCommand })`, the path setup scripts already take). This is the long pole — see
   "warm standby" below.
6. Restore the session (next section), re-targeting each pane's argv at the destination —
   keep the model flags, drop the ones naming a session or a cwd, rewrite paths under the
   checkout.
7. Open it, focused, rebuilding the layout by replaying splits.

### Why the source keeps its copy

Two-phase commit, always. The destination confirms restore; only then does the source mark
the workspace `moved_to: <hostId>` — a tombstone row with a "reclaim" action, its directory
left intact for N days. A design where a laptop closing mid-transfer can evaporate someone's
uncommitted afternoon is not shippable no matter how clean the ref graph is.

## Moving the session: already built

This is the part I over-designed on the first pass. The app already has session transfer,
and it is device-independent by construction.

`superset agents create` exposes three session operations, and `--from-terminal` is the one
that matters here: it reads the terminal's context (`terminal.transcript`, which prefers the
harness's own JSONL and falls back to the sanitized PTY stream), wraps it with
`buildTerminalSessionHandoffPrompt`, and launches a fresh agent seeded with it. Every link
in that chain is **text**. `terminal.transcript` returns a string; `agents.run` takes a
string. No path, no file, no harness store.

So the cross-device move does not copy transcripts. It calls the transfer it already has,
with two different clients:

```
prompt  = hostA.terminal.transcript({ workspaceId, terminalId })  -> sanitize/bound -> prompt
hostB.agents.run({ workspaceId: <new>, agent: <same>, prompt })
```

The one change needed is that `buildHandoffPromptFromTerminal` currently takes a single
client and uses it for both the read and the launch. Split the read host from the launch
host. That is roughly ten lines, not a subsystem.

Everything that follows from this:

- **No transcript files move.** The Claude path-encoding problem — the directory name
  encoding the absolute worktree path, the per-record `cwd` — leaves the critical path
  entirely. It only comes back if we ever want exact `--resume` across devices (below).
- **Harness-agnostic.** Claude, Codex, OpenCode, pi, and the server-side ones all transfer
  identically, because the wire format is a prompt. No per-harness restore code.
- **Version-proof.** No dependency on the two machines running the same Claude Code build,
  or the same harness at all — you can move a Claude session onto Codex.
- **Works to and from a sandbox** with no special casing.

What the manifest still carries is small and boring: the `terminal_agent_bindings` rows, the
scrollback tails to seed the new terminals with (the cold-restore path already does this
after a sandbox wake), the pane layout, and the workspace's own metadata.

### The one real limit

(Superseded in part by the handoff note — see "A working implementation" below. Keep this
path as the fallback for a pane whose agent is dead or unresponsive.)

Transfer is bounded at `TERMINAL_HANDOFF_MAX_CHARS` (36,000 chars, roughly 9–12k tokens).
Continuity across a move is therefore summary-grade: the agent picks up the work, it does not
possess turn 3 of 200. For moving between work sessions that is the right trade, and it is
the trade the existing feature already makes for same-machine handoffs.

If people do ask for the exact session, the upgrade is additive and opt-in: put the raw
transcript blob in the handoff commit (it's text, it deltas well against the previous
handoff) and restore it into the destination harness's store so `--resume <id>` resolves.
That is the point at which the path-rewrite tax gets paid — the directory name must be
re-encoded for the destination worktree and the per-record `cwd` rewritten, or `--resume`
won't offer the session and the agent will misreport its own cwd. Worth doing only on
evidence, and `hasHarnessSession()` is the preflight that tells the destination whether it
landed.

### Still needed on the session side

- A `moved` value for `terminal_agent_bindings.endReason`, so the source's auto-resume
  doesn't relaunch an agent that now lives on another machine. The existing values carry
  intent precisely (`detached` unresumable, `terminal-exited` a candidate, `resumed`
  consumed) and a move is a new intent, not one of those.
- A `lineage_id` on `workspaces`, so a moved workspace's PR link, task, and tags follow it
  across hosts — `workspaces.id` is host-local.
- Pane layout as a one-shot localStorage payload cleared by its consumer, per the
  persisted-key policy in `apps/desktop/AGENTS.md`.


## A working implementation to read: Herdr's Teleport

[Fabien Penso shipped this on 2026-09-29](https://x.com/fabienpenso/status/2104840042418196679):
"Right-click a worktree, pick a remote host, and your branch, uncommitted changes, tabs and
running agents move there. Close your laptop, they keep going." The code is open source and
readable — [penso/herdr-gpui](https://github.com/penso/herdr-gpui), Rust on GPUI, about 6,600
lines in `crates/herdr-gpui/src/teleport/` including tests. It is the same feature, built,
and its module doc states the same scope we arrived at independently: move the worktree with
its branch, commits, uncommitted changes, tabs, running programs and agent sessions, "then
close the source workspace while keeping its checkout."

Read it before building. Below is what it settles, and the three places it disagrees with us.

### The UX, which we had none of

Every screen below is worth copying.

**Entry point.** Right-click the worktree row in the sidebar -> "Teleport…". Not a command
palette, not a settings page: the verb hangs off the object it acts on.

**Host picker.** A plain list, each host with an online dot and a subtitle — "Connected", or
"Not connected; reached over SSH". *Nothing is preselected* (there is a commit for exactly
that: "list teleport hosts instantly, with online dots and none preselected"). An offline
host is still a legal destination, which is the right default and reads as confidence.

**A review step, and this is the whole design.** Picking a host doesn't move anything; it
opens a plan:

```
To beelink · herdr-gpui. Clones the repository there first.
Branch feature/login · 2 unpushed commits · 5 changed files, 1 untracked
beelink cannot reach GitHub, so your token is installed for pull & push.

Tab 1: agent
    claude: resume session
    npm run dev: run again
Tab 2: dev
    Shell
```

Three things that makes right. It is **per-pane**, so nothing is hand-waved as "your
session". Each pane gets a **verb** — "resume session", "run again", plain "Shell" — so you
know which things come back alive and which come back as a prompt. And it states the
**remedies the system will apply on your behalf**, not just the inventory: it will clone the
repo there first, it will install a token because that host can't reach GitHub. The video's
caption for this screen is "Nothing is guessed: every pane has a plan."

**Progress as named steps.** A row of chips, each lighting up in turn: Bundle commits ->
Copy changes -> Create worktree -> Restore changes -> Rebuild tabs -> Stop source -> Move
sessions -> Start programs. The same enum backs the error messages, so a failure reads
"restoring uncommitted changes failed: …" rather than a stack trace. Fifteen steps have
human labels in `error.rs`; free diagnostics for the cost of writing the strings.

**The source survives, visibly.** It stays in the sidebar with a "teleported" mark and a
`teleported` tab where its panes were, programs stopped, checkout intact. Exactly the
two-phase commit we argued for, made legible instead of silent.

**Teleport back is one step**, and reuses the old checkout — "backed up first".

### The implementation, which confirms most of our design

**Dirty state as two throwaway commits, through a temporary index.** Their recipe, which is
better than the `git stash create` I proposed because it needs no git 2.51 and says exactly
what it does:

```sh
staged=$(git write-tree)                              # tree of the index as it stands
cp "$(git rev-parse --git-path index)" "$t/index"     # work on a copy, never the real index
GIT_INDEX_FILE="$t/index" git add -A                  # + untracked, still honouring .gitignore
all=$(GIT_INDEX_FILE="$t/index" git write-tree)
index=$(git commit-tree "$staged" -p HEAD -m 'staged changes')
work=$(git commit-tree "$all" -p "$index" -m 'working tree')
git update-ref refs/… "$work"
```

and the restore, which is four lines:

```sh
git read-tree -m -u HEAD <ref>   # working tree, binary files included
git read-tree <ref>^             # then the staged index, exactly
git update-ref -d <ref>
```

**Bundle prerequisites from the destination's own tips.** This answers the open question in
our transport section. The destination reports up to 20,000 tips
(`for-each-ref refs/heads refs/remotes refs/tags`), and the source excludes them:

```sh
git cat-file --batch-check='%(objectname) %(objecttype)' < tips |
    awk '$2 == "commit" { print "^" $1 }' > revs
git bundle create bundle --stdin < revs
```

The `cat-file` filter is the subtle part: it keeps only tips the *source* also has, so a ref
the source never heard of can't fail the bundle. That is how you get incremental transfer
over a channel with no negotiation — which is precisely our "park" case.

**Preflight refusals we hadn't thought of.** `check_destination` refuses when the branch is
already checked out in a destination worktree (`BranchCheckedOut`), and when the
destination's tip for that branch is not an ancestor of the source's HEAD
(`BranchDiverged`). Both are cheap, both prevent an unrecoverable mess.

**`git add -f` for precious ignored files.** Their one case is the handoff notes: "Handoff
notes travel even where `.herdr` is ignored." Same problem as our `.env` allowlist, same
answer, one line.

**Panes are argv, not agents.** The detail our design missed entirely. `remap_argv` re-targets
each pane's command line: per-agent `value_flags` keep `--model`-style flags with their
values, `replaced_flags` drop the ones naming a session or a cwd (the resume command supplies
its own), paths under the source checkout are rewritten, and an absolute program path outside
the checkout is resolved on the destination's `PATH` instead. A pane doesn't restart correctly
unless you do this.

**Credentials, carefully.** When the destination can't reach GitHub: `gh auth token` on the
local machine, sent over a script's **stdin only** — never an argument, never a log line —
stored at `<common dir>/herdr/github-token` mode 600 (outside every working tree), read by a
repository-local credential helper, with SSH remotes rewritten to HTTPS for that repository
alone. We need less of this (the API already brokers GitHub tokens through the sandbox
firewall), but the stdin-only discipline is the part to copy.

**Marks keyed on (endpoint, repo, branch), never on a workspace id** — "which does not
survive a daemon restart." That sharpens our `lineage_id`: key the mark on the durable
triple rather than minting another synthetic id.

**Layout from geometry.** Their snapshot has split *rectangles*, not a tree, so `layout.rs`
infers the binary tree (a pane's branch at each split follows from which side of the split
line its centre lies) and emits a `BuildPlan` of `SplitStep`s to replay. We have the pane
tree directly, so we skip this — but it's a reminder that the destination rebuilds layout by
*replaying splits*, not by restoring a blob.

### Where it disagrees with us — and where it's right

**1. It moves the whole session, and says so.** `sessions.rs`: "Nothing here asks an agent to
summarize: the full history moves." It reads the session file on the source, rewrites the
source checkout path to the destination's inside it (`rewrite_paths`, byte-level and
boundary-aware), and writes it where that agent looks on the destination — for claude, codex,
opencode, pi and omp. That is the path-rewrite tax I deferred as "not scheduled", paid in
about 500 lines, and they judged it worth paying. **Our estimate was too pessimistic.** It
stays the right call to ship prompt-transfer first, because ours is nearly free, but
"expensive" is no longer the reason to defer it.

**2. `claude_project_dir` is not what we implemented — and upstream fixed it first.** Theirs
reproduces Claude Code's own encoding; ours (`harness-transcript.ts:47`) mapped only `/` and `.`.
Then #7825 (`d3cebba9`) replaced that module with `terminal-agents/harness-sessions/claude.ts`,
whose `claudeProjectDirName` does exactly what Herdr's does: every non-alphanumeric UTF-16 unit
becomes `-`, and past 200 characters it truncates and appends `Math.abs(javaHash(path)).toString(36)`.
The same change stores the path Claude itself reports on `terminal_agent_bindings.transcript_path`
— the primitive an exact cross-device `--resume` would carry, with no re-encoding at all.

**3. The handoff note beats both of our options.** Before moving, each live agent is asked to
write one:

> "This work is moving to another machine. Write a handoff note to `.herdr/teleport/handoff-N.md`
> (create the directory) so another agent can continue seamlessly: the goal, what is done, the
> current state including uncommitted changes, decisions and constraints, open questions, and
> the exact next steps. Do not change anything else, then stop."

300-second timeout; the note is force-added into the bundle; the destination agent starts with
"Read `<path>` and continue the work it describes." And `AgentKind::FALLBACKS` means the note
can be picked up by a *different* agent when the destination lacks the original.

This is strictly better than shipping 36k characters of transcript tail. An agent's own
account of its intent is higher value per byte than the last N chars of what it printed, it
degrades gracefully across harnesses, and it costs one prompt. **Take this for our P1**: keep
the existing `terminal.transcript` transfer as the fallback for a pane whose agent is dead or
unresponsive, and make the handoff note the primary payload for a live one.

Note the cost they accepted: teleporting takes as long as the slowest agent needs to write its
note, up to five minutes. That is a real UX tax, and it is why the review dialog has to say
"asking agents for handoff notes" out loud.

### What we keep that they don't have

Their transport is shell scripts over SSH, by necessity — "the GUI connection's method
allowlist lacks layouts, process details, and agent sessions, so every step runs as a
background script that calls Git and the `herdr` CLI on the host concerned". We already have
the relay and an authenticated host-service on both ends, so we keep the relay-direct fetch
and skip SSH reachability entirely. We also have cloud sandboxes as a destination, which has
no equivalent there. The architectural lesson still holds, though: their orchestrator is a
client-side driver over primitives that already existed, not a new server subsystem. Ours
should be too.

## Prior art, and what each one gets right

- **Sapling's Commit Cloud** (Meta, open source) is the closest thing to the end state:
  every draft commit is uploaded as it's made, no explicit push, so another machine just
  `sl goto <hash>`. Moving machines stops being an operation. Our continuous mode (below) is
  this, with a handoff ref standing in for a draft commit.
- **Jujutsu** makes the working copy itself a commit — every command snapshots it. If dirty
  state is already a commit, transferring it is just `git push`. We can't adopt jj wholesale,
  but `git stash create` is the same trick in one call, and the ecosystem agrees: the
  `yukl vcs-sync` tool publishes jj's `@` as a git ref for exactly this reason.
- **Git 2.51's `stash export`/`import`** is upstream shipping our transfer format.
- **Gitpod** backs a workspace up as a tar to object storage on stop and restores it on
  another node — that's how a Gitpod workspace changes machines at all. Robust and dumb:
  it moves `node_modules` too, with no dedup and no resume. They do it because a Gitpod node
  is ephemeral and arbitrary state must survive; we have a git repo at the center, so we can
  move 300 KB where they move 3 GB.
- **GitHub Codespaces' "export changes to a branch"** is the one-click prior art for the
  dirty-state problem, and its failure modes are instructive: it needs the VM alive to
  bundle the work, so the moment the codespace is unreachable (spending limit, broken start)
  the uncommitted work is stranded, and the forums are full of it. That argues hard for the
  "park" transport and for continuous background handoff — the export must already have
  happened before you need it.
- **Mutagen** (rsync-performance three-way-merge sync with filesystem watching, MIT, the
  thing Docker Desktop uses) and **Syncthing/Unison** solve a *different* problem: two live
  copies staying in sync. For a *move*, continuous bidirectional sync buys conflicts and
  syncs `node_modules`. Worth remembering if we ever want "edit on the laptop, build on the
  workstation", which is a real and separate feature.
- **CRIU / `podman container checkpoint --export`** genuinely migrates running processes,
  memory and all, to another host. Considered and rejected: it wants matching
  kernel/arch/root, TCP connections break or need `--tcp-established`, and it moves a live
  agent's process rather than its conversation. Our sandboxes already boot fresh from a
  filesystem snapshot with no processes, and the app already knows how to restart an agent
  from a session id. Restart beats migrate here.

## Why it will feel instant, and where it won't

The file transfer is genuinely sub-second in the common case: the destination already has
the project's history, so the pack contains the changed blobs and nothing else — hundreds of
KB for a normal afternoon's work, one round trip of negotiation.

The long pole is step 5, `bun install` and friends: tens of seconds to minutes, and no
protocol trick removes it. Two ways to hide it:

- **Warm standby.** A device that is a plausible destination keeps a clone of the project
  and its dependencies warm in the background. Then a move is fetch + checkout + resume.
- **Continuous handoff.** Push the handoff ref on a debounce (idle, or every N seconds).
  The destination pre-fetches. "Move" becomes "check out the ref you already have", and the
  Codespaces failure mode — source unreachable when you need the work — stops existing.
  Costs: object churn, and a GC policy for `refs/superset/handoff/*` (expire after N days,
  keep the last K per workspace).

Continuous mode is where this stops being a feature and becomes the model: the workspace
isn't on a device, it's on your account, and devices attach to it. Cloud sandboxes then fall
out as just another destination — "move to cloud" and "move back down" are the same button,
with the caveat that a stopped sandbox must be woken to serve a fetch, or the parked copy
used.

## Cloud as a destination, as built

The picker offers **Cloud** beside the hosts (behind the same `cloud-workspaces` flag the sidebar
uses). Choosing it runs a different adapter, `createCloudTeleportOperations`, because a sandbox
differs from a machine in two ways that shape every step:

1. **Transport is the hidden ref on origin.** The source host runs `teleport.publish`: capture with
   the precious allowlist *off* (origin may be a public forge), then `git push --force origin
   refs/superset/teleport/<id>`. No bundle, no file transfer — the sandbox clones origin anyway.
2. **Nothing new is assumed on the destination.** The sandbox is created through the cloud API
   (`cloudWorkspace.create`, since host `workspaces.create` is `machineOnlyProcedure`), addressed
   through `cloudWorkspace.access({ wake: true })` until it answers, and restored by
   `terminal.launchSession` running `buildArrivalCommand(ref, branch)` — four git commands that end
   by printing `TELEPORT_RESTORED <n> files on <branch> @ <sha>`. The adapter watches
   `terminal.transcript` for that marker. Both procedures ship in released host-service, so this
   works against a sandbox image that has never heard of teleport.

On arrival the workspace view's `useAutoAdoptBackgroundSessions` gives the launched terminal a
pane, so the restore's own output is the first thing a person sees — the proof is in the frame, not
in a caption. Agents are relaunched from the carried context with `agents.run`, as for a host.

## Traps specific to this repo

- A cloud sandbox cannot be a destination through the host path. `workspaces.create` and
  `project.create` are `machineOnlyProcedure` on host-service: inside a sandbox they refuse,
  because a sandbox holds exactly one project and one workspace. A cloud destination is created
  through the cloud API (what `superset ws create --branch` does) and the arrival restores into
  the checkout the sandbox already has. Machine destinations are unaffected.
- The cloud API names the branch itself. `superset ws create --branch X` on a cloud destination
  produced `superset/teleport-arrival-cloud-cloud-<id>` (derived from `--name`), not `X`. The
  arrival therefore does `git checkout -B <source branch> <base>` inside the box so the checkout is
  on the right branch; `cloud_workspaces.branch` keeps the auto name until that row is updated.
- A fresh sandbox boots the *released* host-service, so a new host procedure (`teleport.restore`)
  reaches it only with a host-service release. Until then a cloud arrival restores with the four
  git commands directly — which is why the transport that needs nothing new on the destination,
  the hidden ref on origin, is the one that works in every direction today.

- `terminal_agent_bindings.endReason` needs a `moved` value, or source and destination both
  try to auto-resume the same session.
- A cloud workspace's name is owned by the cloud row, not the sandbox; its `hostId`
  addresses nothing; its address is a short-lived gate ticket. A move touching a sandbox
  must go through `cloudWorkspace.*`, not the generic host path.
- `projects.sparse_checkout_paths` must be reapplied before restore.
- git-lfs: dirty LFS files need their objects pushed too, or the destination restores
  pointers.
- Only if we ever pursue exact `--resume` across devices: Claude's transcript directory name
  and the per-record `cwd` both encode the absolute worktree path. Off the critical path as
  long as the move uses prompt-based transfer.
- Multi-repo environments (`cloud_workspace_repositories`) mean one handoff ref *per
  checkout*, one manifest for the workspace.
- Refuse early: a branch already checked out on the destination, or a destination tip that
  is not an ancestor of the source HEAD. Both are cheap checks and both prevent a mess.
- `harness-transcript.ts:47` may not match Claude Code's directory encoding for paths with
  underscores or over 200 characters. See finding 2 under "A working implementation".
- Renderer localStorage is a shared ~10 MB quota; layout payloads must be one-shot and
  registered in the persisted-key registry.

## Phasing

- **P0** — device picker UI + move of committed state only, on top of the existing
  create-workspace-from-branch path. Ships the affordance, proves the picker, no new
  transport. (`superset ws create --branch` is already most of the destination side.)
- **P1** — the handoff commit: dirty state + env allowlist, relay-direct transport,
  two-phase commit with a reclaimable source tombstone, `lineage_id`. Session continuity
  rides along in the same phase, because it is a cross-host call to the existing transfer
  plus a `moved` end reason — not its own project.
- **P2** — park-and-resume for an offline source, continuous background handoff, warm
  standby destinations, cloud sandboxes as a first-class source and destination.
- **Not scheduled** — exact `--resume` across devices (raw transcript in the handoff commit,
  harness-store restore, path rewriting). Build on evidence that the 36k-char transfer is
  losing people work, not before.

## Open questions

1. Is "move" the right verb, or is it "attach"? Continuous handoff makes the workspace
   device-independent, and a *move* becomes a UI convention over an always-synced ref.
2. ~~Does GitHub accept pushes to a custom top-level ref namespace?~~ Yes — verified 2026-10-01 by
   pushing `refs/superset/teleport/<workspace id>` to `superset-sh/superset`; it shows in no branch
   list and opens no PR. The caveat stands: on a public repo the capture must carry no `.env`-class
   files, so this transport runs with the precious allowlist empty.
3. What is the size ceiling on untracked files before we refuse and ask the user to exclude?
4. Do we ever move a running dev server's port bindings, or is "it restarted" acceptable?
5. Per-project policy for the env allowlist: opt-in, opt-out, or a prompt on first move?
6. ~~Is 36k chars of transferred context enough?~~ Largely answered: ask the agent for a
   handoff note instead, and keep the transcript tail as the fallback. What's left is
   whether a move should ever *wait* up to five minutes for that note, or write it
   opportunistically in the background well before anyone clicks.
7. Do we copy the review dialog's per-pane plan wholesale? It is the best idea in the
   reference implementation and we have no equivalent surface today.
