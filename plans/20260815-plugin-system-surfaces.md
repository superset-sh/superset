# Plugin System: Surfaces & Architecture Research

Research date: 2026-08-15. Sources: full codebase sweep (v2 desktop), herdr source
(`~/workplace/herdr`, v0.8.x) + docs + `herdr-plugin` topic sampling, bb source
(`~/workplace/bb`, v0.38.0, github.com/get-bb/bb), VS Code extension architecture +
Zed/Obsidian/Raycast/Figma comparisons.

**TL;DR recommendation (rev 2, after bb research):** manifest-first plugin system
(`superset-plugin.json` with a `contributes` catalog, readable without executing code)
with **bb's execution model on our process layout**: plugin backends are typed-SDK
TypeScript loaded **in-process by host-service** (same trust class as setup scripts —
full trust + containment, not sandboxing), plugin UI is **real React in versioned host
slots** in the renderer, gated on first fixing the unrestricted `ipcRenderer` preload
bridge. Declarative-only plugins (themes, agents, skills, presets) need no code at all.
Sandboxed webviews are demoted from "the UI tier" to a future hardening path for
stranger-code at scale. Security spend goes where the real risk is: supply chain
(review-once, tag pinning, kill switch, org policy) and **plugin-scoped API tokens**,
not process isolation. The existing themes pipeline is the installer template; agents
authoring plugins is a first-class flow.

---

## 1. What we learned from the reference systems

### herdr (shipped 500+ plugins in ~1 month)

A plugin = a directory with `herdr-plugin.toml` + arbitrary executables spawned as child
processes. Any language, no SDK, no sandbox, **no permissions model**. "The entire herdr
CLI is the plugin API" — plugins call back via injected `HERDR_BIN_PATH` / JSON-RPC on
`HERDR_SOCKET_PATH` (0600 socket, no auth).

Manifest sections: `[[build]]`, `[[startup]]`, `[[actions]]` (keybindable commands),
`[[events]]` (22 low-volume lifecycle events only — output-change events deliberately
excluded), `[[panes]]` (5 placements: overlay/popup/split/tab/zoomed),
`[[link_handlers]]` (regex on ctrl-clicked terminal URLs). Env-injected context
(`HERDR_PLUGIN_CONTEXT_JSON`, workspace/pane/agent ids).

Marketplace = a Cloudflare Worker cron indexing the `herdr-plugin` GitHub topic every
30 min. Unreviewed by design; no signing, no update command, `--ref` pinning opt-in.
Install = git clone + manifest preview + confirm; build step can't rewrite the manifest.

**What people actually build** (by stars): remote agent-status monitors
(phone/watch/Telegram/PWA), code-review + file-viewer panes, Chromium-in-a-pane,
layout/sessionizer automation, auto-rename via event hooks, kanban dispatch, command
palettes. → The surfaces that matter in practice: **agent-status events, panes, actions**.

**Steal:** CLI-as-API energy, executable-per-hook simplicity, low-volume-events-only
discipline, topic-based frictionless publishing, install preview.
**Fix:** no permissions, no socket auth, no updates, index doesn't parse manifests,
topic counts polluted by adjacent tools.

### bb (get-bb/bb — agent-first IDE, the closest conceptual competitor)

~2k stars, v0.38.0; plugins left experimental 2026-08-04, marketplace shipped 08-15.
Electron + Node server + CLI + host daemon (same rough shape as us). Its own GitHub
integration, memory, tasks, and scheduled jobs are plugins on the public API — "the
IDE that builds itself."

A plugin = **a TS npm package, full-trust, in-process**: backend factory
`plugin(bb: BbPluginApi)` runs *inside the bb Node server* (jiti-loaded TS); optional
frontend is **real host-tree React** loaded same-origin into versioned, props-contracted
slots (`navPanel`, `threadPanelAction`, `homepageSection`, `fileOpener`,
`messageDirective`, composer customization, even wholesale thread-list replacement) —
no iframe/webview tax. Explicitly no sandbox ("plugins are full-trust code"); instead
they engineered **containment**: every callback time-boxed and error-contained, atomic
hot-reload with rollback, incompatible frontend bundles skipped while the backend keeps
running. Manifest = `package.json` `bb` block — identity/entries/engines only, **no
permissions**; the one declarative-by-necessity surface is settings descriptors (host
renders forms without running plugin code).

Backend API is a typed SDK facade (not RPC): namespaced KV + a **private SQLite DB per
plugin**, real HTTP routes, zod-validated RPC to its own frontend, WS broadcast,
supervised background services + cron, **`cli.register` (a real `bb <name>` subcommand
for agents)**, `agents.registerTool` / `contributeInstructions`, thread lifecycle events
(observe-only), and the full BB SDK — plugins can spawn/steer agent threads.

Distribution: data-only marketplace manifests anyone can host (`marketplace.json` →
R2/Worker for the official one); "discovery never executes code"; human-reviews the
*initial* listing then trusts the author; git-tag installs record tag+commit and
**refuse if a tag later moves**; `engines` compat read as a floor not a ceiling (they
broke every installed plugin once with an SDK minor bump). Ecosystem today: 13 first-
party plugins, 3 community ones — all by the same core dev; the full-trust model is
untested by strangers.

**The genuinely novel bit:** the plugin API is designed to be *consumed by LLMs*. The
canonical authoring docs are a built-in agent skill (`bb-plugin-authoring/SKILL.md`);
agents scaffold, build, and hot-reload plugins mid-conversation; marketplace submission
is itself a skill. And one package targets three audiences at once: a panel for humans,
a CLI + tools + skills for agents, a backend service for the system.

**Steal:** agent-authored plugins as a first-class flow; one-package-three-audiences;
containment engineering regardless of sandbox choice; settings-descriptor rule
("declarative only where the host must act without running code"); data-only registry
with tag-move refusal and engines-as-floor. **Fix:** full-trust in-process execution is
the bet we should not copy at our blast radius (org data, credentials, remote hosts) —
but it does prove in-tree React slots give the best plugin UX, which strengthens the
case for our native typed-component tier over webview-everything.

### VS Code (decade-durable ecosystem)

- **Manifest-first is the core insight**: ~38 declarative `contributes` points readable
  without loading code → lazy activation, capability search, UI affordances render
  before any plugin code runs. Anything displayed/searched before run = declarative;
  anything that computes = imperative provider registered by matching ID at activation.
- **Extension host**: all extensions in a separate Node process; **no DOM access ever**
  (keeps workbench refactorable, theming/a11y consistent; avoided the Eclipse/Atom
  monkey-patch death). API is shape-based: plugins supply data, workbench renders.
- The host is an architecture boundary, **not** a security sandbox — full-trust Node,
  hence recurring marketplace malware (typosquats, credential stealers). Mitigations are
  marketplace-side + Workspace Trust.
- The remote model fell out for free: extension host runs where the workspace is, UI
  stays local. **Directly maps to our host-service split.**
- Known hole we must not reproduce: TreeDataProvider too limited / webview too heavy —
  Raycast's typed component vocabulary (`List`, `Detail`, `Form`, `Action`) is the fix,
  capturing ~90% of plugin UI with native fidelity.
- Universal glue: command IDs + when-clause contexts + disposables. Cheap, high leverage.
- API stability discipline (proposed-API gating, never-remove) is why 10-year-old
  extensions still run. Decide the freeze policy before the first public API ships.

### Isolation-vs-power spectrum (ecosystem outcomes)

| System | Model | Outcome |
|---|---|---|
| Obsidian | full-trust JS in renderer | ~2,000+ plugins, the product moat; security = pure trust; OK only because local-first/low-stakes |
| bb | full-trust in-process TS (server) + same-origin React slots (UI) | 2 weeks old, ~16 plugins (nearly all first-party); best-in-class plugin DX + agent-authored plugins; trust deferred entirely to listing review |
| herdr | full-trust child processes | 500+/month; viable while small + terminal-native audience |
| VS Code | out-of-process, full-trust Node | massive, durable, recurring malware |
| Raycast | React → native component vocabulary, reviewed monorepo | thousands, uniformly high quality, best DX reputation |
| Zed | WASM/WIT capability sandbox, tiny API | safe but small; language/theme packs only — "maximal isolation + minimal API yields correctness, not creativity" |
| Figma | QuickJS/iframe sandbox, logic/UI split via postMessage | large + safe; expensive (sandbox rebuilt twice) — the proven shape for untrusted code against sensitive shared state |

Superset's blast radius is closer to Figma than Obsidian: plugins sit next to agents
holding credentials, org data, and remote hosts. We need more isolation than herdr/VS
Code chose, without Zed's API poverty.

---

## 2. Superset surface catalog → contribution points

Full pluggability audit of the v2 desktop. Headline: **no plugin system, plans, or TODOs
exist anywhere**, but three genuine runtime registries and several validated-artifact
pipelines are already plugin-shaped.

### Tier A — already registries; shortest distance

| Surface | Today | To make pluggable |
|---|---|---|
| **Command palette** | Real dynamic registry: `registerProvider(provider)` with unregister, snapshots, subscriptions (`renderer/commandPalette/core/registry.ts`); `Command {id, title, section, when?, run?, children?}` | Open the closed `SectionId` union (add `"plugins"`); freeze `CommandContext` as a public contract. **This is the plugin API already.** |
| **Pane context menus / pane actions** | Declarative `ContextMenuActionConfig` + defaults-transform merge (`packages/panes/src/react/types.ts:13-26`, resolved `Pane.tsx:152-163`) | A workspace-level injection point for plugin-contributed items. Near-zero work. |
| **FilePane views** (markdown preview, image, video, code) | `FileView {id, label, match(path,meta), priority, Renderer}` with VS Code-style priority ranks, static `ALL_VIEWS` array (`usePaneRegistry/components/FilePane/registry/`) | Swap static array for mutable registry. The interface *is* a contribution schema. |
| **Right-sidebar tabs** | `SidebarTabDefinition {id, label, icon?, badge?, actions?, content}` + array literal `[filesTab, changesTab, reviewTab]` (`WorkspaceSidebar.tsx:140`) | Feed array from a registry; widen two zod enums (`activeTab`, `rightSidebarTab`) to string-with-fallback (they're already inconsistent — `review` missing from one). |
| **Pane types** | `packages/panes` is registry-driven: `Pane.kind` is `string`, `PaneRegistry = Record<string, PaneDefinition>`, unknown-kind fallback renders gracefully, **persisted layouts already survive unknown kinds** (`sanitizePaneLayout` uses `z.string()` + `z.unknown()`). App side is a hardcoded `useMemo` literal of 7 kinds closing over ~14 internals (`usePaneRegistry.tsx:211-580`) | Split `builtinPaneDefinitions` from a merge-in contribution registry; open the `PaneViewerData` union for foreign kinds; replace raw zustand `store` in `RendererContext` with a narrowed host API. |

### Tier B — validated-artifact pipelines already user-extensible (declarative plugin content, day one)

| Surface | Today |
|---|---|
| **Themes** | The template: validated JSON import (≤256 KB, packs, reserved ids, inheritance), CLI import/export, UI importer, live-apply nudge via `POST /settings-changed`. **Copy this pipeline for the plugin installer.** |
| **Agent definitions** | Builtins seed host SQLite with full CRUD, `source: "user"` rows via Settings/CLI/MCP. A plugin can ship agents as data. |
| **Terminal presets** | Zod-validated rows, settings UI, hotkey slots, auto-apply on workspace create. |
| **Skills** | `plugins/superset/` bundle + `managed-skills.ts` installer with marker/reap logic — the mechanism to let *plugins* ship agent-facing skills already exists, currently Superset-owned only. |
| **`.superset/config.json` scripts** | The existing arbitrary-code escape hatch (setup/teardown/run shell in host-service), trusted-by-checkout. |
| **Automations** | Full CRUD via UI/CLI/MCP; plugins could ship automation templates. |

### Tier C — medium distance

| Surface | Blocker |
|---|---|
| **Keybindings** | `HotkeyId = keyof typeof HOTKEYS_REGISTRY` (76-entry `as const` literal) is compile-time-closed; user *rebinding* exists (`hotkeyOverridesStore`), adding ids doesn't. Needs runtime-mergeable registry + conflict detection. An old plan already flags "per-extension keybinding contributions" as known-out-of-scope. |
| **Settings pages** | File routes + 3 parallel hardcoded maps + a 1678-line search index typed as closed `Record`. Fix = generic `/settings/plugin/$pluginId` route + VS Code-style `configuration` JSON-schema contributions rendered generically. |
| **Status/notifications** | `PaneStatus` is a closed 5-value priority enum feeding badges/dock; `V2NotificationSource` single-variant; statuses derived only from host terminal-agent bindings. Needs three types opened + a producer API. Toasts/alerts are global imperative singletons — trivially callable, the question is capability-gating. |
| **Native app menu** | Single `buildFromTemplate` literal; mechanical but needs an IPC contribution channel. |

### Tier D — hardest; defer

| Surface | Why |
|---|---|
| **Left sidebar rows/sections** | Pure JSX tree, 6 nested providers, DnD `tabOrder` assumes native children. Inventing a row/section contribution model is a project of its own. Interim: plugins get sidebar presence via right-sidebar tabs, status badges, and command palette instead. |

### Where plugin code can run (process reality)

- **Renderer**: contextIsolation on, but preload exposes **unrestricted** `ipcRenderer`
  — in-renderer plugin JS is a non-starter *until that bridge gets a channel allowlist*;
  with the allowlist in place, versioned React slots become viable (rev 2 chooses this).
- **Electron main**: full privilege, no isolation. Never.
- **`<webview>`**: the one isolated render path already wired (browser pane:
  guest parking, lifecycle, window-open denial, key forwarding all solved in
  `browserRuntimeRegistry.ts` + `browser-manager.ts`). Needs per-plugin `partition` +
  a plugin preload exposing a narrow postMessage bridge (today: shared partition, no preload).
- **Host-service**: separate process, zero Electron coupling (enforced by test), already
  runs arbitrary user shell (setup scripts, PTYs), tRPC/HTTP + WS with manifest-token
  auth, own SQLite, DI-friendly `createApp({providers})`. **The natural plugin backend
  host** — and it makes "plugin runs where the workspace is (remote hosts)" free,
  exactly like VS Code's remote extension host.

---

## 3. Proposed architecture (the verbose system)

### Plugin = directory + manifest + optional code

```jsonc
// superset-plugin.json
{
  "id": "acme.review-board",
  "name": "Review Board",
  "version": "1.0.0",
  "minSupersetVersion": "1.22.0",
  "platforms": ["macos", "linux"],
  "permissions": ["workspaces:read", "terminals:read", "events:subscribe", "net:github.com"],
  "server": "src/server.ts",          // in-process under host-service (dist/server.js when installed)
  "app": "dist/app.js",               // React slot bundle, host-shimmed React/SDK
  "contributes": {
    "commands": [{ "id": "reviewBoard.open", "title": "Open Review Board", "section": "plugins" }],
    "panes": [{ "kind": "acme.review-board.pane", "title": "Review Board", "component": "ReviewBoardPane" }],
    "sidebarTabs": [{ "id": "acme.review", "label": "Review", "component": "ReviewTab" }],
    "fileViews": [{ "id": "acme.csv", "match": "**/*.csv", "priority": "default", "component": "CsvView" }],
    "contextMenu": [{ "target": "pane:terminal", "command": "reviewBoard.open" }],
    "keybindings": [{ "command": "reviewBoard.open", "mac": "mod+shift+r" }],
    "configuration": { /* JSON-schema settings, rendered generically */ },
    "themes": ["themes/acme-dark.json"],
    "agents": ["agents/acme-agent.json"],
    "skills": ["skills/review/SKILL.md"],
    "events": [{ "on": "workspace.created", "command": ["./hooks/on-create.sh"] }],
    "startup": [{ "command": ["node", "worker.js"] }],
    "linkHandlers": [{ "pattern": "github\\.com/.*/pull/\\d+", "command": "reviewBoard.open" }]
  }
}
```

Key properties (VS Code lesson): the manifest renders every UI affordance — palette
entries, menu items, pane kinds in the Add menu, settings pages — **before any plugin
code loads**. Activation is lazy: invoking the contribution starts the code.

### Three execution tiers (rev 2 — bb-style)

1. **Declarative-only** (no code): themes, agent definitions, presets, skills, snippets,
   automation templates, keybindings, settings schemas, plus herdr-style
   spawn-a-command event hooks (`"events": [{on, command}]`) for shell-script plugins.
   Reuses Tier-B pipelines as-is. Many plugins should be able to stay here.
2. **Backend plugins — in-process TS under host-service** (bb model, our layout):
   the manifest's `server` entry default-exports a factory
   `plugin(superset: SupersetPluginApi)` that host-service loads in-process (jiti-style
   TS execution for dev links, prebuilt `dist/server.js` for installs). The API object
   is a typed SDK facade over what host-service already has: namespaced KV + per-plugin
   SQLite, event subscriptions (the low-volume lifecycle set), supervised background
   services + cron, HTTP routes under `/plugins/<id>/*`, `cli.register` (a real
   `superset <name>` subcommand — the agent-facing surface), agent tools/skills
   contribution, and workspace/terminal/agent control through **plugin-scoped tokens**.
   Full trust + **containment**: time-boxed error-contained callbacks, atomic
   install/reload with rollback, per-plugin crash accounting. Same trust class as the
   setup scripts we already run; runs where the workspace runs, so remote hosts work
   for free (this is the structural edge bb doesn't have — their server is local-only).
3. **UI plugins — React in versioned host slots** (bb model): the manifest's `app`
   entry is an esbuild bundle (React + SDK host-shimmed) dynamically imported into the
   renderer, exporting components for **a deliberately small set of slots** — pane kind,
   right-sidebar tab, file view, settings section — each with versioned, additive-only,
   data-shaped prop contracts, wrapped in per-slot error boundaries, `experimental_`
   prefix for unstable slots. **Hard precondition: the preload `ipcRenderer` bridge
   gets a channel allowlist first** — today it is unrestricted, and plugin JS in the
   renderer must never inherit raw main-process IPC. Plugin UI talks to its own backend
   via schema-validated RPC + a WS event channel, and to the workbench only through
   slot props and the narrowed plugin UI API (commands, toasts, theme variables are
   ambient CSS vars already). `<webview>` remains available as an *option* for
   plugins that want arbitrary HTML (we keep the browser-pane plumbing), and a fully
   sandboxed stranger-code tier is a future hardening path (see Security), not a v1
   deliverable.

### Glue

- **Command IDs as universal currency**: menus, keybindings, link handlers, palette all
  bind to commands (both herdr and VS Code converge here; our palette registry is ready).
- **When-clauses**: small context-key expression language for conditional contributions
  (`focusedView` already exists in `CommandContext`).
- **Events**: expose only the low-volume lifecycle set (herdr's discipline):
  workspace/worktree/tab/pane created/closed/focused, `agent_status_changed`,
  automation run finished, PR/check status changed. No output streams in v1.
- **The agent differentiator**: plugins ship *agent-facing* capability (skills, agent
  definitions, MCP tools, automation templates) alongside UI — one package, three
  audiences (human panel, agent CLI/tools/skills, system backend; bb proved the shape).
  For us it's the headline: "a plugin makes your agents better AND gives you the
  dashboard for it."
- **Agents author plugins** (bb's novel move, and squarely our factory direction): ship
  a `superset-plugin-authoring` skill via the managed-skills pipeline so any connected
  agent can scaffold (`superset plugin new`), dev-link, and hot-reload a plugin
  mid-conversation. The manifest/API should be designed to be written by LLMs: one
  obvious file, zod-validated with actionable errors, a fake-host test harness.
- **Containment regardless of sandbox** (bb lesson): time-box and error-contain every
  plugin callback, atomic install/update with rollback, skip an incompatible UI bundle
  while keeping the rest of the plugin alive. Sandboxing bounds malice; containment
  bounds bugs — we need both, and containment is cheap to build in from day one.

### Security posture (rev 2 — full trust, honestly held)

Premise shift: Superset already runs full-trust arbitrary code as the *product* —
coding agents with unrestricted FS access, setup/teardown scripts, user-defined agent
binaries. A process sandbox on the plugin layer protects a thin slice of that surface
while taxing every plugin author (Zed's lesson: maximal isolation + minimal API yields
correctness, not creativity). So we adopt bb's trust stance and spend the security
budget where the real risk is:

- **Supply chain, not execution**: review the initial listing then trust the author
  (bb/Raycast); installs pin tag+commit and refuse moved tags; kill switch to remotely
  delist/disable a malicious version (VS Code's most-used defense in practice);
  org-level policy to allowlist/deny plugins for team accounts; install preview showing
  the true resolved source (herdr).
- **Plugin-scoped API tokens**: full trust on the local machine is one thing; a plugin
  silently wielding the user's org/cloud credentials is another. Everything a plugin
  reaches through our APIs — cloud tRPC, automations, org data — goes through a token
  scoped to declared permissions in the manifest. Neither bb nor herdr has this; it's
  our differentiator and it's cheap.
- **Preload hardening as a precondition**: channel-allowlist the renderer's
  `ipcRenderer` bridge before any plugin JS loads in the renderer. Worth doing
  independent of plugins.
- **Containment ≠ sandbox, build both eventually, containment first**: sandboxing
  bounds malice, containment bounds bugs. Day one: time-boxed callbacks, error
  boundaries per slot, atomic reload/rollback, per-plugin cost attribution (VS Code
  retrofitted this painfully). The genuine sandbox tier (per-plugin-partition webview +
  postMessage bridge, or WASM backends) is the documented hardening path we take when
  the ecosystem is large enough that stranger-code is the norm — which is exactly the
  scale where VS Code's marketplace attacks started.
- Distribution index parses manifests (fixes herdr's gap) so permissions/platforms/
  version-compat are visible pre-install; registry stays a data-only git repo —
  discovery never executes code; pick the governance stance deliberately (VS Code
  marketplace lock-in vs Open VSX lesson).

### Distribution

- Publish = tag a public repo `superset-plugin` (herdr's zero-friction move; our
  marketplace page is near-empty and this fills it fast).
- Index worker parses + validates manifests, surfaces permissions, filters non-plugins
  (fixes herdr's topic pollution). **Discovery never executes code** (bb rule): a
  registry/index refresh can only update metadata; only an explicit install runs
  anything.
- `superset plugin install owner/repo [--ref]` + Settings UI installer reusing the theme
  import UX; `plugin link` for dev; `plugin list/enable/disable/uninstall/update`.
  Installs record resolved tag + commit and **refuse if a tag later moves** (bb's
  "go.sum lesson"); treat `minSupersetVersion`/SDK ranges as a floor, not a ceiling
  (bb once unloaded every installed plugin on an SDK minor bump).
- Optional reviewed/verified tier later (Raycast lesson: review scales fine while small
  and sets the quality bar; bb's "review the listing once, then trust the author" is
  the lighter-weight variant).

---

## 4. Phasing

**Phase 1 — no new runtime** (weeks): manifest format + installer/validator (clone theme
pipeline) + CLI verbs (`plugin new/install/link/dev/list/enable/disable/uninstall/
update`) + declarative contributions only (themes, agents, presets, skills, automation
templates, palette commands that run CLI actions, spawn-a-command event hooks). Ship
the GitHub-topic index + data-only registry. **Also in phase 1: the preload
`ipcRenderer` channel allowlist** — a standalone hardening PR that unblocks phase 2.
This alone matches most of what herdr plugins do.

**Phase 2 — the bb core**: host-service in-process plugin runtime (`SupersetPluginApi`
facade, per-plugin storage/SQLite, events, cron/background services, `cli.register`,
plugin-scoped tokens, containment: time-boxing + atomic reload/rollback) + the first
React slots (right-sidebar tab, pane kind, file view) with versioned prop contracts +
pane context-menu items + the `superset-plugin-authoring` skill so agents can build
plugins end-to-end. **Dogfood immediately by extracting a first-party feature into a
plugin** (ports list, hiring banner, or notices card are natural candidates) — bb's
"builds itself" credibility comes from this and it keeps the API honest.

**Phase 3 — verbose**: keybinding contributions (runtime-mergeable hotkey registry);
settings `configuration` pages; status-producer API (open
`PaneStatus`/`V2NotificationSource`); app-menu contributions; homepage/dashboard
sections; reviewed marketplace tier + kill switch; per-plugin cost attribution UI.

**Hardening path (when stranger-code is the norm)**: per-plugin-partition webview tier
with postMessage bridge for unreviewed plugins; optional typed component schema
(Raycast) as the middle tier; org policy enforcement in cloud.

**Explicit non-goals for v1**: left-sidebar row/section contributions (hardest surface,
defer), output-stream events, plugin JS in Electron main (never), raw DOM/monkey-
patching outside owned slots (never — Obsidian's trap; slots are the contract).

---

## 5. Implementation status (2026-08-16, this branch)

**Shipped and CDP-verified end-to-end** (dev desktop, hello plugin linked live):

- `packages/plugin-sdk` — manifest zod schema (`superset-plugin.json`), backend contract
  (`SupersetPluginApi`: storage/events/actions/realtime/background), UI contract
  (`PluginUiContext`, slot props), react/jsx-runtime `.cjs` shims for esbuild aliasing,
  manifest tests (7).
- Host-service: `plugins` + `plugin_kv` tables (migration 0024), `PluginStore`,
  install/link/git-install with managed checkouts under `~/.superset/plugins`,
  `PluginRuntime` (in-process load: plain import for prebuilt JS, lazy jiti for TS dev
  links; time-boxed error-contained handlers; atomic reload; declarative event-hook
  spawning; lifecycle broadcasts), `plugins` tRPC router (list/install/link/setEnabled/
  uninstall/reload/invokeAction/getAppBundle), EventBus `onBroadcast` tap +
  `plugin:event` message.
- Renderer: blob-module loader with host React shim global (+ CSP `script-src blob:`),
  `PluginSlotMount` with per-slot error boundary, right-sidebar tab slot (open
  `activeTab` schema), palette command bridge, `usePluginEvents` realtime hook,
  lifecycle-event query invalidation. Preload `ipcRenderer` got its channel allowlist
  (only `deep-link-navigate` was ever used).
- CLI: `superset plugin list/install/link/enable/disable/uninstall/reload/invoke/new/
  build` (scaffolder + esbuild shim build).
- `examples/plugins/hello-superset` — dogfood plugin (counter tab + 2 palette commands).

**E2E evidence** (CDP, dev app): tab renders next to Files/Changes/Review; increment
flows UI→invokeAction→backend→KV→realtime.publish→WS→UI (0→3); palette commands run
actions and open the tab; counter survives full app restart (SQLite KV + boot autoload);
live disable/enable propagates ~2s via lifecycle events; a plugin that throws at load
lands `status:error` with message surfaced while other plugins and the host stay healthy.

**Shipped since (08-16, later commits):** pane-kind slot (defs spread before builtins;
`open-pane` command run type focuses-not-duplicates), `ctx.postMessage`/`onMessage`
renderer-local bus between a plugin's surfaces, `"*"` wildcard pane fallback with
state-aware recovery (Enable/Reload/Close), `worktreePath` on `api.workspaces.list()`,
the Plugins page (dashboard sidebar nav, Mobbin-informed rows + install dialog), docs
page (`apps/docs/content/docs/plugins.mdx`), the `plugin-authoring` managed skill, and
five example plugins (hello-superset, agent-board, flock, fleet-review, agent-usage).

**Not yet built** (next slices): file-view slot, plugin detail view + marketplace/browse
tab (Mobbin AI-native research in flight), declarative themes/skills/agents wiring from
manifests, keybinding contributions, plugin-scoped tokens (plugins currently share host
auth), permissions enforcement + install-consent UI, marketplace index,
jiti-under-bundled-host verification for TS dev entries.

## 6. Effort estimate (2026-08-15, rev 2 scope)

Phase 1 ≈ **4–6 engineer-weeks**: manifest+installer ~1.5wk (clone themes/managed-skills
patterns) · CLI verbs + scaffolder ~1wk · declarative contribution wiring ~1wk ·
spawn-command hooks ~3–4d · index worker ~3–5d · preload allowlist ~2–4d (standalone PR).

Phase 2 ≈ **7–10 engineer-weeks**: host-service runtime + `SupersetPluginApi` +
plugin-scoped tokens + containment ~3–4wk (fiddly bit: compiled CLI discovering
`cli.register` subcommands at runtime) · slot loader + 3 slots ~2–3wk (pane slot is
the hard one: `usePaneRegistry` closes over ~14 internals; `RendererContext` must be
narrowed) · SDK package + esbuild toolchain + dev watch + fake-host harness ~1–2wk ·
authoring skill ~2–3d · dogfood extraction ~3–5d (+ gap fixes it surfaces).

Not in the table: **API freeze** (slot props + SDK additive-only once public — keep
slot count tiny) and marketplace ops (review, kill switch). Cheapest validation
slice: phase 1 minus index worker ≈ 3wk, enough for themes+agents+skills+commands+
hooks plugins.

## 6. Open questions

1. Manifest format: JSON (matches themes/config.json tooling) vs TOML (herdr
   familiarity). Leaning JSON + zod, consistent with the repo.
2. Where does plugin state live? Proposal: host SQLite table + per-plugin state dir
   (herdr's `HERDR_PLUGIN_STATE_DIR`), never the shared localStorage quota
   (would collide with the persisted-key registry policy).
3. Plugin-scoped tRPC tokens: new token class in host manifest.json, or scoped children
   of the existing token?
4. ~~Bridge-only vs direct WS for UI plugins~~ — resolved by rev 2: plugin UI is
   in-tree React; it gets a scoped `workspaceTrpc`-style client bound to its
   plugin-scoped token, plus RPC to its own backend. Remaining sub-question: does the
   scoped client enforce permissions client-side, server-side, or both (answer should
   be: server-side is the boundary, client-side is DX).
5. API freeze policy: bb's variant — `experimental_` prefix on unstable slots + an
   audit doc + additive-only props within an SDK major — over VS Code's heavier
   proposed-API gating. Decide before the first public SDK release.
6. ~~Trusted tier with in-process React slots?~~ — resolved by rev 2: in-process slots
   ARE the primary UI model (bb-style); the sandboxed webview tier moved to the
   hardening path for unreviewed stranger-code at scale.
7. Backend runtime placement detail: one shared plugin runtime inside the host-service
   process (bb-style, simplest, best API fidelity) vs a plugin-host child process per
   host (VS Code-style, survives plugin crashes/leaks without touching terminals).
   Leaning in-process + containment first, child process later if fleet telemetry
   shows plugin-induced host-service instability — terminals are our crown jewels.
8. SDK packaging: publish `@superset/plugin-sdk` (types + fake-host test harness, bb
   ships both) from the monorepo; pin exactly in scaffolds.
