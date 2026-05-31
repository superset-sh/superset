import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const packages = {
	auth: {
		path: "packages/auth",
		role: "Authentication package shared by API, web, and desktop surfaces.",
		examples: ["packages/auth/src/index.ts"],
	},
	chat: {
		path: "packages/chat",
		role: "Shared chat runtime, desktop auth storage, slash commands, and client hooks.",
		examples: [
			"packages/chat/src/server/trpc/service.ts",
			"packages/chat/src/server/desktop/chat-service/chat-service.ts",
			"packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts",
		],
	},
	cli: {
		path: "packages/cli",
		role: "CLI package. Treat this as command/tooling code, not as React UI.",
		examples: ["packages/cli/package.json"],
	},
	"cli-framework": {
		path: "packages/cli-framework",
		role: "Reusable CLI framework primitives.",
		examples: ["packages/cli-framework/package.json"],
	},
	db: {
		path: "packages/db",
		role: "Cloud PostgreSQL schema and Drizzle database package.",
		examples: [
			"packages/db/src/schema/schema.ts",
			"packages/db/src/schema/relations.ts",
			"packages/db/src/client.ts",
		],
		category: "database",
	},
	email: {
		path: "packages/email",
		role: "Email templates and delivery utilities.",
		examples: ["packages/email/package.json"],
	},
	"host-service": {
		path: "packages/host-service",
		role: "Local host runtime for v2 projects/workspaces, terminal sessions, git, chat, and relay.",
		examples: [
			"packages/host-service/src/app.ts",
			"packages/host-service/src/trpc/router/project/handlers.ts",
			"packages/host-service/src/terminal/terminal.ts",
			"packages/host-service/src/daemon/DaemonSupervisor.ts",
		],
		category: "host-service",
	},
	"local-db": {
		path: "packages/local-db",
		role: "Desktop local SQLite schema and local persistence package.",
		examples: [
			"packages/local-db/src/schema/schema.ts",
			"packages/local-db/src/schema/relations.ts",
		],
		category: "database",
	},
	"macos-process-metrics": {
		path: "packages/macos-process-metrics",
		role: "macOS process metrics native support package.",
		examples: ["packages/macos-process-metrics/package.json"],
	},
	mcp: {
		path: "packages/mcp",
		role: "Legacy MCP integration package.",
		examples: ["packages/mcp/package.json"],
		category: "mcp",
	},
	"mcp-v2": {
		path: "packages/mcp-v2",
		role: "MCP v2 server and tools for tasks, projects, workspaces, agents, hosts, and automations.",
		examples: [
			"packages/mcp-v2/src/define-tool.ts",
			"packages/mcp-v2/src/tools/workspaces/create.ts",
			"packages/mcp-v2/src/tools/agents/run.ts",
		],
		category: "mcp",
	},
	panes: {
		path: "packages/panes",
		role: "Reusable split-pane workspace layout store and React renderer.",
		examples: [
			"packages/panes/src/core/store/store.ts",
			"packages/panes/src/react/components/Workspace/Workspace.tsx",
		],
		category: "panes",
	},
	"port-scanner": {
		path: "packages/port-scanner",
		role: "Port scanning utilities used by terminal and host runtime features.",
		examples: ["packages/port-scanner/package.json"],
	},
	"pty-daemon": {
		path: "packages/pty-daemon",
		role: "Detached PTY daemon with protocol framing, session store, and fd-handoff.",
		examples: [
			"packages/pty-daemon/src/Server/Server.ts",
			"packages/pty-daemon/src/SessionStore/SessionStore.ts",
			"packages/pty-daemon/src/protocol/messages.ts",
		],
		category: "daemon",
	},
	sdk: {
		path: "packages/sdk",
		role: "External SDK surface.",
		examples: ["packages/sdk/package.json"],
	},
	shared: {
		path: "packages/shared",
		role: "Shared constants, host info, notification types, and cross-package utilities.",
		examples: ["packages/shared/src/constants.ts"],
	},
	trpc: {
		path: "packages/trpc",
		role: "Cloud API tRPC routers and shared server/client wiring.",
		examples: [
			"packages/trpc/src/root.ts",
			"packages/trpc/src/router/v2-workspace/v2-workspace.ts",
			"packages/trpc/src/router/chat/chat.ts",
		],
		category: "trpc",
	},
	ui: {
		path: "packages/ui",
		role: "Shared React UI package, shadcn components, AI elements, hooks, and assets.",
		examples: [
			"packages/ui/src/components/ui/button.tsx",
			"packages/ui/src/components/ai-elements/message.tsx",
			"packages/ui/src/components/overflow-fade/OverflowFadeText/OverflowFadeText.tsx",
		],
		category: "ui-library",
	},
	"workspace-client": {
		path: "packages/workspace-client",
		role: "Workspace client helpers.",
		examples: ["packages/workspace-client/package.json"],
	},
	"workspace-fs": {
		path: "packages/workspace-fs",
		role: "Workspace filesystem helpers and services.",
		examples: ["packages/workspace-fs/package.json"],
	},
	admin: {
		path: "apps/admin",
		role: "Admin dashboard app.",
		examples: ["apps/admin/package.json"],
		category: "next-app",
	},
	api: {
		path: "apps/api",
		role: "Next.js API app with OAuth metadata, API routes, and tRPC context.",
		examples: [
			"apps/api/src/app/.well-known/openid-configuration/route.ts",
			"apps/api/src/trpc/context.ts",
			"apps/api/src/proxy.ts",
		],
		category: "next-app",
	},
	desktop: {
		path: "apps/desktop",
		role: "Electron desktop app. This is the primary package for v2 workspace refactors.",
		examples: [
			"apps/desktop/src/main/index.ts",
			"apps/desktop/src/lib/trpc/routers/index.ts",
			"apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx",
			"apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx",
		],
		category: "desktop",
	},
	docs: {
		path: "apps/docs",
		role: "Documentation site.",
		examples: ["apps/docs/package.json"],
		category: "next-app",
	},
	"electric-proxy": {
		path: "apps/electric-proxy",
		role: "Electric proxy app for local/dev sync flows.",
		examples: ["apps/electric-proxy/package.json"],
	},
	marketing: {
		path: "apps/marketing",
		role: "Marketing site with App Router pages, content, and marketing components.",
		examples: [
			"apps/marketing/src/app/page.tsx",
			"apps/marketing/src/app/components/HeroSection/HeroSection.tsx",
			"apps/marketing/src/lib/changelog.ts",
		],
		category: "next-app",
	},
	mobile: {
		path: "apps/mobile",
		role: "Expo React Native mobile app.",
		examples: [
			"apps/mobile/app/(authenticated)/(home)/index.tsx",
			"apps/mobile/screens/(auth)/sign-in/SignInScreen.tsx",
			"apps/mobile/components/ui/button.tsx",
		],
		category: "mobile",
	},
	relay: {
		path: "apps/relay",
		role: "Relay app package.",
		examples: ["apps/relay/package.json"],
	},
	streams: {
		path: "apps/streams",
		role: "Streams app package.",
		examples: ["apps/streams/package.json"],
		category: "next-app",
	},
	web: {
		path: "apps/web",
		role: "Main web application app.superset.sh.",
		examples: [
			"apps/web/src/app/layout.tsx",
			"apps/web/src/trpc/react.tsx",
			"apps/web/src/proxy.ts",
		],
		category: "next-app",
	},
	typescript: {
		path: "tooling/typescript",
		role: "Shared TypeScript config package for the monorepo.",
		examples: ["tooling/typescript/package.json"],
	},
};

function write(rel, content) {
	const full = path.join(root, rel);
	mkdirSync(path.dirname(full), { recursive: true });
	writeFileSync(full, `${content.trimEnd()}\n`, "utf8");
}

function bullets(items) {
	return items.map((item) => `- ${item}`).join("\n");
}

function examples(pkg) {
	return bullets(
		pkg.examples
			.filter((file) => existsSync(path.join(root, file)))
			.map((file) => `\`${file}\``),
	);
}

const repoRules = [
	"Use Bun only. Do not introduce npm, yarn, pnpm, or package-lock/yarn/pnpm lockfiles.",
	"Run quality commands from the repo root unless a package script explicitly says otherwise: `bun run lint`, `bun run lint:fix`, `bun run typecheck`, `bun test`.",
	"Biome is root-scoped. Lint warnings fail CI, so run `bun run lint:fix` after edits and verify `bun run lint` exits 0 before pushing.",
	"Prefer strong TypeScript types. Avoid `any`; when boundary data is untyped, validate or narrow it close to the boundary.",
	"Keep plans in `plans/` or `apps/<app>/plans/`; shipped plans move to `plans/done/`. Architecture docs belong in `<app>/docs/`.",
	"Shared commands and skills live in `.agents/commands/` and `.agents/skills/`. `.claude/commands`, `.claude/skills`, `.cursor/commands`, `.codex/commands`, and `.codex/prompts` should stay symlinks or shared pointers, not divergent copies.",
	"Mastra dependencies must use published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarballs or patch steps unless explicitly requested.",
	"For Next.js 16 request interception, use `proxy.ts`; never create `middleware.ts`.",
	"TanStack DB / Electric live queries are cache-first: render existing `data` even when collections are not ready. Use readiness only to choose between loading and empty states when there is no data.",
	"Never touch production databases unless explicitly requested and confirmed. Do not manually edit generated Drizzle migration files.",
];

const frontendRules = [
	"One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.",
	"Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.",
	"Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.",
	"shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.",
	"Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.",
	"Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.",
	"Do not hide persisted Electric/TanStack rows while `isReady` or `isLoading` is false; this causes blanking regressions.",
	"Keep user-facing error text selectable in desktop renderer UI with `select-text cursor-text` when it is rendered in a body subtree with `user-select: none`.",
];

const backendRules = [
	"Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.",
	"Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.",
	"Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.",
	"Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.",
	"Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.",
	"Tests should sit next to risky behavior: `.test.ts` for unit tests, `.node-test.ts` for real Node/PTY flows, integration tests for cross-layer contracts.",
];

function commonIndex(kind, pkg) {
	const guides =
		kind === "backend"
			? [
					"[Directory Structure](./directory-structure.md)",
					"[Database Guidelines](./database-guidelines.md)",
					"[Error Handling](./error-handling.md)",
					"[Logging Guidelines](./logging-guidelines.md)",
					"[Quality Guidelines](./quality-guidelines.md)",
				]
			: [
					"[Directory Structure](./directory-structure.md)",
					"[Component Guidelines](./component-guidelines.md)",
					"[Hook Guidelines](./hook-guidelines.md)",
					"[State Management](./state-management.md)",
					"[Type Safety](./type-safety.md)",
					"[Quality Guidelines](./quality-guidelines.md)",
				];
	return `# ${kind === "backend" ? "Backend" : "Frontend"} Guidelines: ${pkg.path}

${pkg.role}

## Read First

- Follow the repo-wide guide: \`.trellis/spec/guides/superset-engineering-guide.md\`.
- Follow root \`AGENTS.md\` and any nearer package \`AGENTS.md\`.
- This package's generated Trellis specs document current conventions. Match existing code before inventing new abstractions.

## Local Examples

${examples(pkg) || "- No package-specific examples were detected during bootstrap; inspect the package before editing."}

## Guide Index

${bullets(guides)}
`;
}

function directoryDoc(kind, pkg) {
	const extra =
		pkg.category === "desktop"
			? `
## Desktop Structure

- \`apps/desktop/src/main/\` owns Electron main-process lifecycle, host-service coordination, native permissions, tray/menu, and bundled CLI setup.
- \`apps/desktop/src/preload/\` is the preload bridge. Keep it narrow.
- \`apps/desktop/src/lib/trpc/\` is the Electron IPC boundary. Per \`apps/desktop/AGENTS.md\`, use tRPC for Electron IPC instead of ad hoc ipcMain/ipcRenderer channels.
- \`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/\` owns the v2 workspace shell.
- \`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/\` owns pane registration and pane viewer wiring.
`
			: pkg.category === "mobile"
				? `
## Mobile Structure

- \`apps/mobile/app/\` owns Expo Router routes, redirects, route guards, and navigation layouts.
- \`apps/mobile/screens/\` owns UI and screen business logic. Mirror the \`app/\` route structure and re-export screen components from matching app routes.
- \`apps/mobile/components/ui/\` contains NativeWind/shadcn-style primitives.
`
				: pkg.category === "next-app"
					? `
## Next.js Structure

- App Router pages live under \`src/app/\`.
- Request interception must use \`src/proxy.ts\`; never add \`middleware.ts\`.
- Feature components used by one page belong under that page or route segment. Shared components move to the nearest shared \`components/\` folder.
`
					: pkg.category === "host-service"
						? `
## Host-Service Structure

- \`src/app.ts\` composes Hono, tRPC, event bus, git watcher, chat runtime, filesystem, and remote-control routes.
- \`src/trpc/router/*\` owns host-service procedures. Keep route-specific schemas and helpers near their router.
- \`src/runtime/*\` owns long-lived runtime managers.
- \`src/terminal/*\` owns terminal session orchestration and daemon client adoption.
- \`src/daemon/*\` owns pty-daemon process supervision.
`
						: "";
	const base = kind === "backend" ? backendRules : frontendRules;
	return `# Directory Structure

## Package

- Path: \`${pkg.path}\`
- Role: ${pkg.role}

## Repo Rules

${bullets(repoRules.slice(0, 7))}

## ${kind === "backend" ? "Backend" : "Frontend / TypeScript"} Structure Rules

${bullets(base.slice(0, 5))}
${extra}
## Examples

${examples(pkg) || "- Inspect this package before changing its layout."}
`;
}

function componentDoc(pkg) {
	const extra =
		pkg.path === "packages/ui"
			? "In `packages/ui`, shadcn primitives stay as kebab-case single files under `src/components/ui/`; custom components can use folder-per-component when outside that generator-owned area."
			: pkg.category === "panes"
				? "In `packages/panes`, keep core store/layout logic in `src/core/` and React rendering primitives in `src/react/`; do not make app-specific pane behavior part of the shared package."
				: pkg.category === "desktop"
					? "Desktop v2 pane UI should be implemented through the pane registry and existing pane components instead of bypassing `@superset/panes`."
					: pkg.category === "mobile"
						? "Mobile routes should re-export screen components; keep substantial UI in `screens/`, not directly in `app/` route files."
						: "Match the nearest existing page/component pattern before introducing a new structure.";
	return `# Component Guidelines

## Rules

${bullets(frontendRules.slice(0, 6))}
- ${extra}

## Examples

${examples(pkg) || "- Search the package for nearby components before adding a new one."}
`;
}

function hookDoc(pkg) {
	return `# Hook Guidelines

## Rules

- Name hooks with \`use...\` and keep them close to the feature that owns the state or side effect.
- Co-locate hook tests beside hooks when the hook contains branching, cache behavior, routing, or parsing logic.
- For TanStack DB / Electric live queries, render cached \`data\` first. Do not blank UI only because readiness flags are false.
- For tRPC / React Query hooks, keep query keys and invalidation close to the feature route or provider.
- Keep long-running process state in host-service / daemon layers, not in React hooks.

## Examples

${examples(pkg) || "- Inspect nearby hooks before adding a new hook."}
`;
}

function stateDoc(pkg) {
	const extra =
		pkg.category === "desktop"
			? `
- Desktop renderer stores live under \`apps/desktop/src/renderer/stores/\` or feature-local \`state/\` folders.
- V2 workspace document state is feature-local, for example \`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore/\`.
- Terminal PTY lifetime is owned by host-service / pty-daemon; renderer stores may track UI attachment and pane state but must not become the process owner.
`
			: "";
	return `# State Management

## Rules

- Prefer local React state for view-only state.
- Use feature-local providers/stores when state belongs to one route or workflow.
- Use TanStack Query/tRPC for server calls and invalidation.
- Use Electric/TanStack DB collections cache-first: existing rows stay visible while readiness catches up.
- Persisted local settings should use existing package stores/helpers instead of ad hoc localStorage.
${extra}
## Examples

${examples(pkg) || "- Inspect existing stores/providers before adding state."}
`;
}

function typeDoc(pkg) {
	return `# Type Safety

## Rules

- Avoid \`any\`. Prefer explicit domain types, Zod schemas at boundaries, and narrowed unknowns.
- Share reusable types from the package that owns the domain. Do not copy identical payload types across renderer, host-service, and cloud routers.
- Use discriminated unions for lifecycle/event payloads and branch on stable \`type\`, \`kind\`, or \`status\` fields.
- Keep generated or framework-owned types in their expected locations.
- When changing shared types, search all consumers before editing.

## Examples

${examples(pkg) || "- Inspect exported types before adding new ones."}
`;
}

function frontendQuality(pkg) {
	return `# Quality Guidelines

## Required Checks

- Run \`bun run lint:fix\` after edits that affect source files.
- Run \`bun run lint\` before pushing; warnings fail CI.
- Run focused tests for touched packages and \`bun run typecheck\` for broad type changes.
- Keep tests co-located with logic-heavy components, hooks, parsers, stores, and utilities.

## Review Checklist

${bullets(frontendRules)}

## Examples

${examples(pkg) || "- Add tests near the behavior being changed."}
`;
}

function databaseDoc(pkg) {
	const specific =
		pkg.category === "database"
			? `
- Cloud schema lives in \`packages/db/src/schema/\`.
- Desktop/local SQLite schema lives in \`packages/local-db/src/schema/\` and host-service local schema lives in \`packages/host-service/src/db/schema.ts\`.
`
			: "";
	return `# Database Guidelines

## Rules

- Use Drizzle ORM for database access.
- Do not touch production databases unless explicitly requested and confirmed.
- For cloud migrations, change schema files first and ask for \`bunx drizzle-kit generate --name="<sample_name_snake_case>"\`.
- Never manually edit \`packages/db/drizzle/\` SQL, snapshots, or journal files.
- Treat write/seeding effects differently from cache-first rendering; wait for strict readiness before deriving missing rows or writing defaults unless the write is provably idempotent.
${specific}
## Examples

${examples(pkg) || "- Inspect schema ownership before changing persisted data."}
`;
}

function errorDoc(pkg) {
	return `# Error Handling

## Rules

- Use \`TRPCError\` for expected tRPC procedure failures.
- Return typed domain results when callers need to distinguish recoverable outcomes.
- Keep cleanup best-effort blocks isolated so one cleanup failure does not skip the rest.
- In desktop renderer UI, rendered errors must be selectable with \`select-text cursor-text\`.
- Do not swallow unexpected errors silently; log enough context to reproduce without leaking secrets.

## Examples

${examples(pkg) || "- Inspect nearby error handling before adding new flows."}
`;
}

function loggingDoc(pkg) {
	return `# Logging Guidelines

## Rules

- Log operational events at the layer that owns the runtime.
- Prefer structured logs for daemon/host-service lifecycle events where possible.
- Include identifiers such as organizationId, workspaceId, terminalId, or host id when they are safe and useful.
- Never log auth tokens, provider credentials, host-service secrets, refresh tokens, or user private content.
- Best-effort cleanup warnings should be warnings, not thrown errors that abort unrelated cleanup.

## Examples

${examples(pkg) || "- Inspect nearby logging before adding new messages."}
`;
}

function backendQuality(pkg) {
	const extra =
		pkg.category === "daemon" || pkg.category === "host-service"
			? "For daemon, PTY, host-service restart/adoption, and process-tree behavior, use real Node tests where mocks would hide lifecycle bugs."
			: "Use focused unit tests for schemas, routers, and helpers that branch on user or runtime state.";
	return `# Quality Guidelines

## Required Checks

- Run \`bun run lint:fix\` after source edits.
- Run \`bun run lint\` and focused tests before pushing.
- Run \`bun run typecheck\` for shared type, router, schema, or package export changes.
- ${extra}

## Review Checklist

${bullets(backendRules)}

## Examples

${examples(pkg) || "- Add tests close to changed behavior."}
`;
}

function writePackageSpecs(name, pkg) {
	const base = `.trellis/spec/${name}`;
	const backendDir = path.join(root, base, "backend");
	const frontendDir = path.join(root, base, "frontend");

	if (existsSync(backendDir)) {
		write(`${base}/backend/index.md`, commonIndex("backend", pkg));
		write(
			`${base}/backend/directory-structure.md`,
			directoryDoc("backend", pkg),
		);
		write(`${base}/backend/database-guidelines.md`, databaseDoc(pkg));
		write(`${base}/backend/error-handling.md`, errorDoc(pkg));
		write(`${base}/backend/logging-guidelines.md`, loggingDoc(pkg));
		write(`${base}/backend/quality-guidelines.md`, backendQuality(pkg));
	}

	if (existsSync(frontendDir)) {
		write(`${base}/frontend/index.md`, commonIndex("frontend", pkg));
		write(
			`${base}/frontend/directory-structure.md`,
			directoryDoc("frontend", pkg),
		);
		write(`${base}/frontend/component-guidelines.md`, componentDoc(pkg));
		write(`${base}/frontend/hook-guidelines.md`, hookDoc(pkg));
		write(`${base}/frontend/state-management.md`, stateDoc(pkg));
		write(`${base}/frontend/type-safety.md`, typeDoc(pkg));
		write(`${base}/frontend/quality-guidelines.md`, frontendQuality(pkg));
	}
}

function writeGlobalGuide() {
	write(
		".trellis/spec/guides/superset-engineering-guide.md",
		`# Superset Engineering Guide

This guide captures repo-wide rules imported from \`AGENTS.md\`, package AGENTS files, and the current code layout. Load it for every Trellis task.

## Repo Shape

- Bun + Turbo monorepo.
- Apps: \`apps/web\`, \`apps/marketing\`, \`apps/admin\`, \`apps/api\`, \`apps/desktop\`, \`apps/docs\`, \`apps/mobile\`, plus support apps.
- Packages: \`packages/ui\`, \`packages/db\`, \`packages/auth\`, \`packages/trpc\`, \`packages/shared\`, \`packages/mcp\`, \`packages/mcp-v2\`, \`packages/local-db\`, \`packages/host-service\`, \`packages/pty-daemon\`, \`packages/panes\`, and related utilities.

## Non-Negotiable Rules

${bullets(repoRules)}

## Frontend Rules

${bullets(frontendRules)}

## Backend Rules

${bullets(backendRules)}

## Desktop-Specific Rules

- Electron IPC must use tRPC as defined under \`apps/desktop/src/lib/trpc\`.
- Use path aliases from the nearest \`tsconfig.json\` where possible.
- Standard tRPC async-generator subscriptions do not work with \`trpc-electron\`; Electron subscriptions must return observables from \`@trpc/server/observable\`.
- Error text rendered in the desktop renderer must be selectable with \`select-text cursor-text\`.
- V2 workspace UI lives under \`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/\` and uses \`@superset/panes\` for pane layout.
- Terminal panes attach to sessions created by host-service. Do not make React pane lifecycle own PTY lifetime.

## Mobile-Specific Rules

- \`apps/mobile/app/\` owns routing, redirects, route guards, and layouts.
- \`apps/mobile/screens/\` owns screen UI and business logic; mirror the \`app/\` structure and re-export screen components from routes.

## Database Rules

- Cloud schema: \`packages/db/src/schema/\`.
- Local desktop schema: \`packages/local-db/src/schema/\`.
- Host-service local schema: \`packages/host-service/src/db/schema.ts\`.
- Do not manually edit generated Drizzle migration files under \`packages/db/drizzle/\`.

## Good Examples

- Desktop v2 workspace route: \`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx\`
- Host-service app composition: \`packages/host-service/src/app.ts\`
- Terminal session adoption: \`packages/host-service/src/terminal/terminal.ts\`
- Detached PTY supervision: \`packages/host-service/src/daemon/DaemonSupervisor.ts\`
- Cloud schema ownership: \`packages/db/src/schema/schema.ts\`
- Shared UI shadcn exception: \`packages/ui/src/components/ui/button.tsx\`
- Mobile app/screens split: \`apps/mobile/app/(authenticated)/(home)/index.tsx\` and \`apps/mobile/screens/(authenticated)/(home)/index.ts\`
`,
	);

	const indexPath = path.join(root, ".trellis/spec/guides/index.md");
	let index = readFileSync(indexPath, "utf8");
	if (!index.includes("superset-engineering-guide.md")) {
		index = index.replace(
			"| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |",
			"| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |\n| [Superset Engineering Guide](./superset-engineering-guide.md) | Repo-wide Superset conventions | Every task |",
		);
		index = index.replace(
			"### When to Think About Cross-Layer Issues",
			"### Always Load Superset Rules\n\n- [ ] You are changing this repository at all\n- [ ] You are touching desktop, host-service, DB, tRPC, UI, mobile, or MCP code\n\n-> Read [Superset Engineering Guide](./superset-engineering-guide.md)\n\n### When to Think About Cross-Layer Issues",
		);
		writeFileSync(indexPath, index, "utf8");
	}
}

function updateBootstrapTask() {
	const prdPath = path.join(
		root,
		".trellis/tasks/00-bootstrap-guidelines/prd.md",
	);
	if (!existsSync(prdPath)) {
		return;
	}
	let prd = readFileSync(prdPath, "utf8");
	prd = prd.replace(
		/- \[ \] Fill guidelines for /g,
		"- [x] Fill guidelines for ",
	);
	prd = prd.replace("- [ ] Add code examples", "- [x] Add code examples");
	if (!prd.includes("## Bootstrap Notes")) {
		prd += `

## Bootstrap Notes

- Imported root repo rules from \`AGENTS.md\`.
- Imported desktop-specific rules from \`apps/desktop/AGENTS.md\`.
- Imported mobile routing/screen split from \`apps/mobile/AGENTS.md\`.
- Added repo-wide Trellis guide at \`.trellis/spec/guides/superset-engineering-guide.md\`.
- Replaced generated placeholder package specs with concrete package roles, rules, and path examples.
`;
	}
	writeFileSync(prdPath, prd, "utf8");
}

for (const [name, pkg] of Object.entries(packages)) {
	writePackageSpecs(name, pkg);
}
writeGlobalGuide();
updateBootstrapTask();

console.log(
	`Bootstrapped Trellis specs for ${Object.keys(packages).length} packages.`,
);
