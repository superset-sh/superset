---
name: plugin-authoring
description: Author a Superset desktop plugin end-to-end — scaffold with the superset CLI, write the manifest, backend, and UI components, then build, link, reload, and verify. Use when the user wants to build or create a Superset plugin, extend Superset, or add a pane, sidebar tab, or command-palette entry to Superset.
argument-hint: what the plugin should do
---

# Superset Plugin Authoring

A Superset plugin is a directory with a `superset-plugin.json` manifest plus up to two entries: a backend (`server`) loaded in-process by the host-service, and a UI bundle (`app`) whose named React component exports render in native desktop slots (right-sidebar tabs, panes, command palette). Plugins are full-trust code with containment: handlers are time-boxed and error-contained, a bad plugin degrades itself, never the host.

## The dev loop

```bash
superset plugin new my-plugin        # scaffold: manifest + src/server.ts + src/app.tsx
cd my-plugin
superset plugin build .              # esbuild the UI bundle → dist/app.js
superset plugin link .               # register the directory in place (dev mode)
# …edit src/… then:
superset plugin build .              # only needed when the UI changed
superset plugin reload <id>          # re-reads manifest, reloads backend + UI
```

The app picks up link/reload within ~2s, no restart. Sidebar tabs appear in any v2 workspace next to Files/Changes/Review; commands appear in the command palette.

## Manifest reference (`superset-plugin.json`)

```jsonc
{
	"id": "acme.review-board",          // REQUIRED. lowercase dot-namespaced author.plugin-name, globally unique
	"name": "Review Board",             // REQUIRED. display name
	"version": "1.0.0",                 // REQUIRED. semver
	"description": "…",                 // optional, ≤500 chars
	"minSupersetVersion": "1.22.0",     // optional
	"platforms": ["macos", "linux"],    // optional; omit = all (macos|linux|windows)
	"permissions": ["events:subscribe", "workspaces:read"], // declared + shown at install; NOT enforced yet
	"server": "dist/server.js",         // backend entry; TS path OK for dev links
	"app": "dist/app.js",               // prebuilt ESM UI bundle from `superset plugin build`
	"contributes": {
		"sidebarTabs": [
			// component = named export of the app bundle
			{ "id": "board", "label": "Board", "component": "BoardTab" }
		],
		"panes": [
			// kind MUST be prefixed with the plugin id; one instance per kind
			{ "kind": "acme.review-board.pane", "title": "Review Board", "component": "BoardPane" }
		],
		"commands": [
			{ "id": "open", "title": "Review Board: Open",
			  "run": { "type": "open-sidebar-tab", "tabId": "board" } },
			{ "id": "pane", "title": "Review Board: Open as Pane",
			  "run": { "type": "open-pane", "kind": "acme.review-board.pane" } },
			{ "id": "refresh", "title": "Review Board: Refresh",
			  "run": { "type": "action", "action": "refresh" } }
		],
		"events": [
			// argv array spawned on the event with SUPERSET_PLUGIN_* env context; no backend needed
			{ "on": "workspace.created", "command": ["./hooks/on-create.sh"] }
		]
		// "themes": reserved, not wired yet
	}
}
```

Validator rules: entry paths are relative with no `..`; `sidebarTabs`/`panes` require `app`; a command's `open-sidebar-tab`/`open-pane` target must exist in the corresponding contribution list.

Event kinds: `workspace.created|updated|deleted`, `project.created|updated|deleted`, `agent.lifecycle` (normalized hook events: `Start`, `Stop`, `PermissionRequest`, `Failed`, `Attached`, `Detached`), `terminal.exit`, `port.added|removed`. High-volume streams (terminal output, fs events) are not available.

## Backend (`server` entry)

Default-export a factory taking the full API:

```ts
import type { SupersetPluginApi } from "@superset/plugin-sdk";

export default async function plugin(api: SupersetPluginApi) {
	api.log("loaded", { some: "structured data" });

	// Named actions: invokable from the UI (ctx.invokeAction), palette commands,
	// and `superset plugin invoke`. context.workspaceId is set for workspace-scoped calls.
	api.actions.register("refresh", async (params, { workspaceId }) => {
		return { ok: true };
	});

	// Persistent per-plugin KV. JSON values ≤256KB. Survives restarts.
	await api.storage.set("count", 1);
	const count = await api.storage.get<number>("count");
	await api.storage.delete("old-key");
	const keys = await api.storage.keys();

	// Lifecycle events; "*" receives every kind. Handler gets
	// { kind, workspaceId?, payload, occurredAt }.
	api.events.on("agent.lifecycle", (event) => {});

	// Push ephemeral payloads to this plugin's mounted UI components
	// (every window/machine attached to the host).
	api.realtime.publish({ type: "tick", count });

	// Supervised repeating task; cleared automatically on unload/reload.
	api.background.interval(60_000, async () => {});

	// Live (non-archived) workspaces on this host:
	// { id, name, branch, type, projectId, worktreePath }.
	const workspaces = await api.workspaces.list();

	return { dispose() {/* optional cleanup on unload/reload */} };
}
```

Containment semantics: factory has 10s to return; action handlers time-boxed at 10s; event handlers at 5s (fire-and-forget, errors logged, never propagated); a failed load tears down everything the factory registered and the plugin shows `status: error`.

## UI (`app` entry)

Named exports taking `PluginSlotProps`, referenced by `component` in the manifest:

```tsx
import type { PluginSlotProps } from "@superset/plugin-sdk/ui";
import { useEffect, useState } from "react";

export function BoardTab({ ctx }: PluginSlotProps) {
	// ctx.pluginId, ctx.workspaceId
	// ctx.invokeAction(name, params?)  → backend action, returns its result
	// ctx.onRealtime(handler)          → payloads from api.realtime.publish; returns unsubscribe
	// ctx.postMessage(payload) / ctx.onMessage(handler)
	//   → this plugin's OTHER mounted surfaces in the same workspace
	//     (pane ↔ sidebar tab), renderer-local, no server round-trip
	const [state, setState] = useState<unknown>(null);
	useEffect(() => ctx.onRealtime(setState), [ctx]);
	return <div style={{ padding: 16 }}>{JSON.stringify(state)}</div>;
}
```

Load initial state with `ctx.invokeAction` on mount (a `get-*` action), then subscribe to `ctx.onRealtime` for pushes.

Build mechanics: `superset plugin build .` runs esbuild with `react` / `react/jsx-runtime` aliased to shims that read the host's React at runtime, so components render in the host tree (hooks work, one React). You never need to configure esbuild yourself; just run the command.

## Verify

```bash
superset plugin list                         # status per plugin: running / error / disabled
                                             # error rows include the load error message
superset plugin invoke <id> <action> --params '{"x":1}'   # smoke-test a backend action
superset plugin reload <id>                  # after every edit round
```

Verification recipe: after `link`, run `list` and confirm `status: running`. If `error`, the message on the row tells you what threw at load. Smoke-test each registered action with `invoke` before touching the UI. Then open a v2 workspace and check the sidebar tab / palette entries render.

## Rules

- Plugin ids are `author.plugin-name`: lowercase, dot-namespaced, globally unique. Pane kinds are prefixed with the plugin id (`acme.board.pane`); one pane instance per kind.
- Ship prebuilt `dist/server.js` for installable plugins; a TypeScript `server` entry is fine for dev links only.
- UI styling: inline styles or a `dist/app.css` sibling (auto-injected). Tailwind classes are NOT available in plugin components. Host theme colors are available as CSS variables. Never import `react-dom`.
- `permissions` are declared and shown at install but NOT enforced; never assume they gate anything. Design as if the backend has the host-service's full capability, because it does.
- Choose the right channel: `api.realtime.publish` → `ctx.onRealtime` for backend-to-UI (crosses windows/machines); `ctx.postMessage`/`ctx.onMessage` for surface-to-surface within one workspace's renderer.
- Register everything inside the factory; state you want across restarts goes in `api.storage`, not module scope.
