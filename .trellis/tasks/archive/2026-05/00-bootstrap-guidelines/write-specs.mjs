import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const specRoot = join(root, ".trellis/spec");

function write(path, content) {
	const full = join(root, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, `${content.trim()}\n`);
}

function md(lines) {
	return lines.join("\n");
}

function bullet(items) {
	return items.map((item) => `- ${item}`).join("\n");
}

function packageIndex({ title, layer, guide }) {
	const shared = [
		"[Monorepo Standards](../../guides/monorepo-standards.md)",
		"[Code Reuse Thinking Guide](../../guides/code-reuse-thinking-guide.md)",
		"[Cross-Layer Thinking Guide](../../guides/cross-layer-thinking-guide.md)",
	];
	if (layer === "frontend") {
		shared.splice(1, 0, "[Frontend Conventions](../../guides/frontend-conventions.md)");
	} else {
		shared.splice(1, 0, "[Backend Conventions](../../guides/backend-conventions.md)");
		shared.splice(2, 0, "[Database And Migrations](../../guides/database-and-migrations.md)");
	}
	if (guide.includes("terminal") || guide.includes("daemon") || guide.includes("host-service")) {
		shared.splice(shared.length - 2, 0, "[Terminal And Host Runtime](../../guides/terminal-and-host-runtime.md)");
	}

	return md([
		`# ${title} ${layer === "backend" ? "Backend" : "Frontend"} Guidelines`,
		"",
		"Read these files before editing this package layer:",
		"",
		"- [Package Guidelines](./package-guidelines.md)",
		...shared.map((item) => `- ${item}`),
		"",
		"Use the package guide for local ownership and examples; use shared guides for repo-wide rules that apply across packages.",
	]);
}

function packageGuide({
	title,
	layer,
	scope,
	source,
	patterns,
	avoid,
	validate,
	cross = [],
}) {
	return md([
		`# ${title} ${layer === "backend" ? "Backend" : "Frontend"} Package Guidelines`,
		"",
		"## Scope",
		scope,
		"",
		"## Source Examples",
		bullet(source),
		"",
		"## Local Patterns",
		bullet(patterns),
		"",
		...(cross.length
			? [
					"## Cross-Package Contracts",
					bullet(cross),
					"",
				]
			: []),
		"## Avoid",
		bullet(avoid),
		"",
		"## Validation",
		bullet(validate),
	]);
}

const sharedGuides = {
	"index.md": md([
		"# Superset Project Guides",
		"",
		"These guides capture conventions that apply across packages. Package indexes link back here when a rule is shared rather than package-specific.",
		"",
		"| Guide | Use When |",
		"| --- | --- |",
		"| [Monorepo Standards](./monorepo-standards.md) | Starting any repo work, choosing commands, or placing docs and plans. |",
		"| [Frontend Conventions](./frontend-conventions.md) | Editing React, Next.js, Expo, Tailwind, shadcn, or TanStack DB code. |",
		"| [Backend Conventions](./backend-conventions.md) | Editing tRPC, Hono, CLI, MCP, host-service, SDK, worker, or service code. |",
		"| [Database And Migrations](./database-and-migrations.md) | Editing Drizzle schemas, database clients, or generated migration boundaries. |",
		"| [Terminal And Host Runtime](./terminal-and-host-runtime.md) | Editing terminal, host-service, pty-daemon, relay, remote-control, or daemon code. |",
		"| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Adding helpers, constants, config, or repeated logic. |",
		"| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Changing payloads, events, DB rows, RPC contracts, or UI data flow across layers. |",
		"",
		"Run the relevant package validation from the package guide, then run root `bun run lint` before pushing.",
	]),
	"monorepo-standards.md": md([
		"# Monorepo Standards",
		"",
		"## Workspace Meaning",
		"In this repository, workspace means the isolated Superset git-worktree checkout you are running in. Do not assume it means an editor workspace.",
		"",
		"## Commands",
		bullet([
			"Use Bun for package operations. Do not introduce npm, yarn, or pnpm lockfiles or scripts.",
			"Use Turbo/root scripts for broad checks: `bun run lint`, `bun run lint:fix`, `bun run format`, `bun run typecheck`, `bun test`, and `bun build`.",
			"Biome runs at the repository root. `bun run lint:fix` maps to `biome check --write --unsafe`; `bun run lint` is check-only and CI treats warnings as failures.",
			"Prefer package scripts for tight validation while iterating, then run the root command that matches the blast radius.",
			"Prefer `gh` for GitHub operations such as PRs and issues when available.",
		]),
		"",
		"## File Placement",
		bullet([
			"Implementation plans belong in `plans/` for cross-cutting work or `apps/<app>/plans/` for app-scoped work. Move shipped plans to `plans/done/`.",
			"Architecture and reference docs belong in `<app>/docs/` or an existing docs directory. Do not drop `*_PLAN.md` at an app root or inside `src/`.",
			"Shared agent commands live in `.agents/commands/`; skills live in `.agents/skills/`. Keep `.claude/commands` and `.cursor/commands` symlinked to `../.agents/commands`; keep `.claude/skills` symlinked to `../.agents/skills`.",
			"Shared MCP config lives in `.mcp.json`. `.cursor/mcp.json` links to `../.mcp.json`; Codex uses `.codex/config.toml`; OpenCode mirrors the same server set in `opencode.json`.",
		]),
		"",
		"## Dependency Rules",
		bullet([
			"Use published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarballs, local overrides, or patch steps unless explicitly requested.",
			"Keep package exports explicit in `package.json`. Follow examples like `@superset/auth`, `@superset/shared`, `@superset/workspace-fs`, and `@superset/ui`.",
			"Avoid `any`. Prefer inferred Drizzle/tRPC/router types, Zod schemas, discriminated unions, and package-exported types.",
		]),
		"",
		"## Questions And Confirmations",
		"When the host exposes a Superset interactive question tool such as `ask_user` or an equivalent overlay, use it for every user question, including yes/no confirmations. Plain text questions are easy for the UI to miss.",
		"",
		"## Source Examples",
		bullet([
			"`AGENTS.md` defines the repo-wide command, migration, package-manager, and question-tool rules.",
			"`apps/desktop/AGENTS.md` and `apps/desktop/CLAUDE.md` define desktop IPC and renderer gotchas.",
			"`apps/mobile/AGENTS.md` defines the Expo route/screen split.",
			"`package.json` at the root owns the root quality commands.",
		]),
	]),
	"frontend-conventions.md": md([
		"# Frontend Conventions",
		"",
		"## Component Organization",
		bullet([
			"Use one folder per product component: `ComponentName/ComponentName.tsx` plus `index.ts`.",
			"Co-locate dependencies by usage. If a component is used only by its parent, nest it under the parent's `components/`. Promote to the highest shared parent only when used in multiple places.",
			"Co-locate local hooks, utils, constants, tests, stories, providers, and stores next to the feature that owns them.",
			"Keep one component per file except for small private helpers inside the same file, as seen in `AccountSettings` with `SettingRow`.",
			"`src/components/ui/`, `src/components/ai-elements/`, and mobile `components/ui/` are shadcn-style exceptions: kebab-case single files are intentional for CLI updates.",
		]),
		"",
		"## Next.js App Router",
		bullet([
			"Next.js 16 uses `proxy.ts`; never create `middleware.ts`. See `apps/web/src/proxy.ts`, `apps/admin/src/proxy.ts`, and `apps/api/src/proxy.ts`.",
			"Use route groups and local component folders under `src/app`, as in `apps/web/src/app/(agents)/components/SessionList/SessionList.tsx` and `apps/admin/src/app/(dashboard)/components/MetricCard/MetricCard.tsx`.",
			"Use server actions in route-local `actions.ts` files when form submission must run on the server. `apps/marketing/src/app/contact/actions.ts` sanitizes, validates, rate-limits, and returns serializable objects.",
			"Use `cache` for server-only cached helpers, as in `apps/web/src/app/(agents)/utils/getAgentsUiAccess/getAgentsUiAccess.ts`.",
		]),
		"",
		"## Tailwind And UI",
		bullet([
			"Use Tailwind utility classes and shared tokens from `@superset/ui`. Merge conditional classes with `cn` from `packages/ui/src/lib/utils.ts`.",
			"Use `@superset/ui` shadcn components for shared web/desktop UI; add new shadcn components in `packages/ui/` with the shadcn CLI rather than hand-building duplicates.",
			"Use lucide icons for tool buttons where a matching icon exists.",
			"Text in desktop error surfaces must remain selectable when users need to copy it. `apps/desktop/AGENTS.md` calls for `select-text cursor-text` because the renderer body disables selection.",
		]),
		"",
		"## TanStack DB And Electric Live Queries",
		"`useLiveQuery` is cache-first. It can return persisted `data` while a collection is not `isReady`. Render existing rows first; use readiness only to choose the empty/loading branch when there is no data.",
		"",
		"```tsx",
		"const { data: rows = [], isReady } = useLiveQuery((q) => q.from({ users: collections.users }), [collections]);",
		"const user = rows.find((row) => row.id === currentUserId);",
		"",
		"return !isReady && !user ? <ProfileSkeleton /> : user ? <ProfileForm user={user} /> : <EmptyState />;",
		"```",
		"",
		"Use strict readiness for write/seeding side effects unless the write is provably idempotent. Examples: `apps/desktop/src/renderer/routes/_authenticated/settings/account/components/AccountSettings/AccountSettings.tsx`, `apps/desktop/src/renderer/hooks/useCurrentPlan.ts`, and mobile collection setup in `apps/mobile/screens/(authenticated)/providers/CollectionsProvider/CollectionsProvider.tsx`.",
		"",
		"## Mobile App Split",
		bullet([
			"Expo routes in `apps/mobile/app/` own routing, redirects, and layouts.",
			"UI, hooks, providers, and business logic live under `apps/mobile/screens/`, mirroring the app route shape.",
			"Route files usually re-export a screen: `apps/mobile/app/(authenticated)/(home)/index.tsx` exports `WorkspacesScreen` from `apps/mobile/screens/(authenticated)/(home)/workspaces`.",
		]),
		"",
		"## State And Tests",
		bullet([
			"Use React state for component-local UI, TanStack Query/tRPC for server state, TanStack DB/Electric for synced collections, and Zustand for desktop-only renderer UI state.",
			"Desktop Zustand stores live in `apps/desktop/src/renderer/stores/`; follow the selector and devtools guidance in `apps/desktop/src/renderer/stores/README.md`.",
			"Put tests next to the code under test when practical: examples include `packages/ui/src/components/ai-elements/message.test.tsx` and desktop route/store tests.",
		]),
	]),
	"backend-conventions.md": md([
		"# Backend Conventions",
		"",
		"## tRPC And API Boundaries",
		bullet([
			"Define procedures with Zod input schemas and explicit `TRPCError` failures. `packages/trpc/src/trpc.ts` is the shared cloud tRPC base.",
			"Use `protectedProcedure`, `jwtProcedure`, or `adminProcedure` rather than re-implementing auth checks.",
			"Scope organization resources with helpers such as `requireActiveOrgId`, `requireOrgResourceAccess`, and `requireOrgScopedResource` from `packages/trpc/src/router/utils/`.",
			"Add router files as `router/<domain>/<domain>.ts` plus `router/<domain>/index.ts`, then mount them in `packages/trpc/src/root.ts`.",
			"Host-service has its own Hono/tRPC router stack under `packages/host-service/src/trpc/router`; keep cloud API concerns in `packages/trpc` and local machine concerns in host-service.",
		]),
		"",
		"## Runtime Construction",
		bullet([
			"`packages/host-service/src/app.ts` is the local service composition root. Build dependencies there, but keep test overrides injectable through `CreateAppOptions`.",
			"Host-service routes should receive runtime managers through context instead of importing Electron. `packages/host-service/src/no-electron-coupling.test.ts` guards this boundary.",
			"Background work that can fail during startup should be idempotent and logged, not allowed to block server startup. `runMainWorkspaceSweep` is started with `void ...catch(...)`.",
			"CLI code should parse and validate at the command boundary, then call typed library functions. See `packages/cli/src/lib/auth.ts`, `packages/cli/src/lib/resolve-auth.ts`, and `packages/cli-framework/src/parser.ts`.",
		]),
		"",
		"## Errors And Logging",
		bullet([
			"Use `TRPCError` for client-facing tRPC failures with stable codes and actionable messages.",
			"Return sanitized form/action errors to users; log provider details server-side. `apps/marketing/src/app/contact/actions.ts` is the local pattern.",
			"Use `console.warn` or `console.error` for background service failures when no structured logger is present, with a package prefix such as `[host-service]` or function name.",
			"Keep low-level protocol errors typed and machine-readable when they cross process boundaries, as in `packages/pty-daemon/src/protocol/messages.ts`.",
		]),
		"",
		"## Testing",
		bullet([
			"Use `bun test` for most package tests. Unit tests are common beside source files, for example `packages/trpc/src/router/task/task.test.ts` and `packages/host-service/src/events/event-bus.test.ts`.",
			"Host-service integration tests live under `packages/host-service/test/integration/` and rely on injected dependencies to avoid accidental network or Electron coupling.",
			"Node-specific PTY daemon integration runs under Node, not Bun, because node-pty runtime behavior is Node-dependent.",
		]),
	]),
	"database-and-migrations.md": md([
		"# Database And Migrations",
		"",
		"## Cloud Database",
		bullet([
			"`packages/db/src/client.ts` creates Neon HTTP and WebSocket Drizzle clients with `casing: \"snake_case\"`.",
			"Schema lives in `packages/db/src/schema/`. Keep enums in `enums.ts`, tables in domain schema files, relations in `relations.ts`, and Zod payload schemas in `zod.ts`.",
			"Use Drizzle table inference types: `typeof table.$inferInsert` and `typeof table.$inferSelect`. Examples: `InsertTask`, `SelectTask`, `InsertProject`, and `SelectProject`.",
			"Use explicit indexes and unique constraints in table callbacks. `packages/db/src/schema/schema.ts` shows the naming pattern, for example `tasks_org_slug_unique`.",
		]),
		"",
		"## Local Databases",
		bullet([
			"`packages/local-db/src/schema/schema.ts` uses `sqliteTable`, integer booleans, `uuidv4()` defaults, and JSON typed columns for desktop-local state.",
			"`packages/host-service/src/db/schema.ts` owns host-service SQLite state. Keep host-service database changes scoped there; do not mix local machine state into cloud schema.",
			"Keep local database validation schemas near the schema package, for example `packages/local-db/src/schema/zod.ts`.",
		]),
		"",
		"## Migration Rules",
		bullet([
			"Never touch the production database unless explicitly asked, and confirm before doing so.",
			"For cloud schema changes, create a Neon branch, point local root `.env` files at that branch, modify only `packages/db/src/schema/`, then generate with `bunx drizzle-kit generate --name=\"sample_name_snake_case\"`.",
			"Do not manually edit generated migration artifacts under `packages/db/drizzle/`, including SQL files, snapshots, and `meta/_journal.json`.",
			"Treat package-local `drizzle/` folders as generated outputs as well unless a package-specific workflow says otherwise.",
			"Do not run migrations yourself unless the user explicitly asks for that operation.",
		]),
		"",
		"## Schema Example",
		"```ts",
		"export const tasks = pgTable(\"tasks\", {",
		"  id: uuid().primaryKey().defaultRandom(),",
		"  organizationId: uuid(\"organization_id\").notNull().references(() => organizations.id, { onDelete: \"cascade\" }),",
		"  createdAt: timestamp(\"created_at\").notNull().defaultNow(),",
		"}, (table) => [",
		"  index(\"tasks_organization_id_idx\").on(table.organizationId),",
		"]);",
		"export type SelectTask = typeof tasks.$inferSelect;",
		"```",
	]),
	"terminal-and-host-runtime.md": md([
		"# Terminal And Host Runtime",
		"",
		"## Package Boundaries",
		bullet([
			"`packages/pty-daemon` owns live PTYs and is standalone. It must not import from `@superset/host-service` or other workspace packages; host-service consumes protocol types through `@superset/pty-daemon/protocol`.",
			"`packages/host-service` is the local machine service. It owns Hono routes, SQLite state, git/runtime managers, event bus, terminal WebSocket routes, and daemon supervision.",
			"`apps/desktop/src/main` coordinates Electron windows and packaged services. Renderer code talks to Electron main through tRPC from `apps/desktop/src/lib/trpc` and to host-service through typed clients.",
		]),
		"",
		"## IPC And Subscriptions",
		"Desktop Electron IPC uses tRPC. For `trpc-electron`, subscriptions must return observables, not async generators.",
		"",
		"```ts",
		"import { observable } from \"@trpc/server/observable\";",
		"",
		"publicProcedure.subscription(() =>",
		"  observable<MyEvent>((emit) => {",
		"    const handler = (event: MyEvent) => emit.next(event);",
		"    emitter.on(\"event\", handler);",
		"    return () => emitter.off(\"event\", handler);",
		"  }),",
		");",
		"```",
		"",
		"Source: `apps/desktop/CLAUDE.md` and `apps/desktop/src/lib/trpc/routers/index.ts`.",
		"",
		"## PTY Byte Fidelity",
		bullet([
			"PTY input and output bytes ride in the pty-daemon frame binary payload tail. Do not base64 encode them inside JSON.",
			"Do not decode output with per-chunk `chunk.toString(\"utf8\")` in the data path. The host-service observer path uses `StringDecoder` only for string callback compatibility.",
			"Primary terminal WebSocket output is binary; renderer/xterm consumes `Uint8Array`. Control messages remain JSON.",
			"Flow control is byte-counted. Renderer acks consumed bytes; host-service forwards `output-ack` to the daemon.",
		]),
		"",
		"## Daemon Lifecycle",
		bullet([
			"The daemon runs under Node 20+ via Electron's bundled Node. Bun is the build/test tool, not the production daemon runtime.",
			"The Unix socket file mode `0600` is the auth boundary; do not add ad hoc in-band tokens to the pty-daemon protocol.",
			"Protocol version negotiation happens with `hello` and `hello-ack` in `packages/pty-daemon/src/protocol/messages.ts`.",
			"Upgrade handoff preserves live sessions by passing PTY master fds to a successor process. Preserve tests in `packages/pty-daemon/test/handoff.test.ts` and `packages/host-service/src/terminal/terminal.adoption.node-test.ts` when changing adoption.",
		]),
		"",
		"## Source Examples",
		bullet([
			"`packages/pty-daemon/README.md` documents runtime, layout, testing, and out-of-scope items.",
			"`packages/pty-daemon/src/protocol/framing.ts` and `messages.ts` define wire format.",
			"`packages/pty-daemon/src/Server/Server.ts` implements handshake, flow control, replay, and handoff.",
			"`packages/host-service/src/terminal/terminal.ts` bridges daemon sessions to workspace terminal WebSockets.",
			"`apps/desktop/src/main/lib/host-service-coordinator.ts` coordinates packaged host-service lifecycle.",
		]),
	]),
};

for (const [name, content] of Object.entries(sharedGuides)) {
	write(`.trellis/spec/guides/${name}`, content);
}

const packages = [
	{
		key: "auth",
		title: "@superset/auth",
		layers: {
			backend: {
				scope: "Better Auth server configuration, session organization state, billing hooks, Resend email helpers, and auth-related utilities.",
				source: [
					"`packages/auth/src/server.ts` wires Better Auth plugins and exported server auth.",
					"`packages/auth/src/lib/resolve-session-organization-state.ts` keeps organization selection logic pure and tested.",
					"`packages/auth/src/lib/rate-limit.ts` and `resend.ts` isolate provider integrations.",
					"`packages/auth/src/stripe.ts` keeps Stripe auth/billing integration at the auth boundary.",
				],
				patterns: [
					"Export server-only auth through `@superset/auth/server`; do not make app packages reach into auth internals.",
					"Keep session and organization resolution in pure helpers with co-located tests before wiring it into Better Auth callbacks.",
					"Use `env.ts` for environment validation; do not read raw env vars in call sites.",
					"Provider failures should return stable auth errors and log details server-side.",
				],
				cross: [
					"`packages/trpc/src/trpc.ts` and app `proxy.ts` files consume the auth server export.",
					"`packages/db/src/schema/auth.ts` owns auth database tables; auth code should not create migrations directly.",
				],
				avoid: [
					"Do not duplicate session parsing in apps; use the package export.",
					"Do not bypass rate limiting for invitation or email flows.",
					"Do not add provider secrets outside `env.ts` schemas.",
				],
				validate: ["`bun --cwd packages/auth test`", "`bun --cwd packages/auth typecheck`"],
			},
			frontend: {
				scope: "Client auth helpers consumed by web, desktop renderer, and mobile surfaces.",
				source: [
					"`packages/auth/src/client.ts` is the client-side export.",
					"`apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` shows app-side sign-in usage.",
					"`apps/mobile/lib/auth/client.ts` wraps mobile auth client access.",
				],
				patterns: [
					"Import from `@superset/auth/client` for browser/mobile auth clients rather than reaching into server code.",
					"Keep UI-specific loading state in the app; keep shared auth client configuration in the package.",
					"Use serializable auth state across route boundaries and keep server redirects in app route code.",
				],
				avoid: [
					"Do not import `@superset/auth/server` into client components.",
					"Do not duplicate OAuth provider button logic across apps when a shared helper exists.",
				],
				validate: ["`bun --cwd packages/auth typecheck`", "Run the consuming app typecheck when changing client exports."],
			},
		},
	},
	{
		key: "chat",
		title: "@superset/chat",
		layers: {
			backend: {
				scope: "Mastra-backed desktop and Hono chat service, provider auth, slash-command resolution, and chat tRPC runtime helpers.",
				source: [
					"`packages/chat/src/server/desktop/chat-service/chat-service.ts` owns the desktop chat service.",
					"`packages/chat/src/server/desktop/slash-commands/registry.ts` and tests define slash-command behavior.",
					"`packages/chat/src/server/trpc/service.ts` exposes chat service operations through tRPC.",
					"`packages/chat/src/server/shared/small-model/get-small-model.ts` centralizes small-model selection.",
				],
				patterns: [
					"Use upstream `mastracode` and `@mastra/*`; do not add forks or local patch workflows.",
					"Keep provider auth storage and OAuth flow logic under `server/desktop/auth` and `chat-service`.",
					"Keep slash-command parsing in `shared/` and resolution/registry work in `server/desktop/slash-commands/`.",
					"Add tests for parser, registry, runtime creation, and provider auth edge cases.",
				],
				cross: [
					"Host-service constructs `ChatService` in `packages/host-service/src/app.ts` and proxies provider auth through host-service routers.",
					"Desktop renderer uses the client provider/hooks from `packages/chat/src/client`.",
				],
				avoid: [
					"Do not put renderer state into server runtime helpers.",
					"Do not read `.claude/commands` directly outside the slash-command discovery layer.",
					"Do not silently fall back between model providers without preserving test coverage.",
				],
				validate: ["`bun --cwd packages/chat test`", "`bun --cwd packages/chat typecheck`"],
			},
			frontend: {
				scope: "React chat client provider, display hooks, and shared slash-command parsing used by renderer experiences.",
				source: [
					"`packages/chat/src/client/provider/provider.tsx` wires chat client context.",
					"`packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts` owns display state.",
					"`packages/chat/src/shared/slash-command-arguments.ts` and related tests are shared parser utilities.",
				],
				patterns: [
					"Keep React providers under `src/client/provider` and export through `src/client/index.ts`.",
					"Keep display/race behavior in hooks with tests; do not duplicate chat state machines in app components.",
					"Shared parser utilities must remain runtime-neutral and tested with plain Bun tests.",
				],
				avoid: [
					"Do not import desktop-only server files into client bundles.",
					"Do not parse slash-command arguments inline in UI components.",
				],
				validate: ["`bun --cwd packages/chat test`", "`bun --cwd packages/chat typecheck`"],
			},
		},
	},
	{
		key: "cli",
		title: "@superset/cli",
		layers: {
			frontend: {
				scope: "Bun-distributed CLI commands, Ink UI, auth resolution, API upload helpers, and packaging scripts.",
				source: [
					"`packages/cli/src/commands/middleware.ts` wires command middleware.",
					"`packages/cli/src/lib/command.ts` defines command helpers.",
					"`packages/cli/src/lib/auth.ts`, `resolve-auth.ts`, and tests own auth resolution.",
					"`packages/cli/CLI_SPEC_CURRENT.md` and `CLI_SPEC_TARGET.md` describe current and target CLI behavior.",
				],
				patterns: [
					"Build commands on `@superset/cli-framework`; keep parsing, auth, and side effects separated.",
					"Use `SUPERSET_API_URL` from the dev script and `src/lib/env.ts`; do not hard-code API URLs.",
					"Keep upload/auth/network helpers in `src/lib` with tests before adding command UI around them.",
					"Use Bun build scripts already present in `package.json` for distributable binaries.",
				],
				avoid: [
					"Do not bypass the command framework for new commands.",
					"Do not mix interactive prompt rendering with API client internals.",
					"Do not add another CLI package manager or lockfile.",
				],
				validate: ["`bun --cwd packages/cli typecheck`", "Run targeted `bun test` files for changed `src/lib/*.test.ts` files."],
			},
		},
	},
	{
		key: "cli-framework",
		title: "@superset/cli-framework",
		layers: {
			backend: {
				scope: "Runtime-neutral command parser, router, middleware, errors, build/dev helpers, and command execution core.",
				source: [
					"`packages/cli-framework/src/parser.ts` parses argv into command options.",
					"`packages/cli-framework/src/router.ts` and `runner.ts` dispatch commands.",
					"`packages/cli-framework/src/errors.ts` owns framework error types.",
					"`packages/cli-framework/src/build.ts` and `dev.ts` power package CLI scripts.",
				],
				patterns: [
					"Keep this package dependency-light and framework-owned; product CLI logic belongs in `packages/cli`.",
					"Model command definitions with typed options from `option.ts` and `command.ts`.",
					"Return structured errors from parsing/running so consuming CLIs can render them.",
				],
				avoid: [
					"Do not import Superset app state or API clients here.",
					"Do not make parser behavior depend on process-global mutable state.",
				],
				validate: ["`bun --cwd packages/cli-framework typecheck`"],
			},
			frontend: {
				scope: "CLI user-facing output, help text, and developer command ergonomics produced by the framework.",
				source: [
					"`packages/cli-framework/src/help.ts` renders command help.",
					"`packages/cli-framework/src/output.ts` centralizes terminal output helpers.",
					"`packages/cli-framework/src/bin.ts` exposes the framework binary.",
				],
				patterns: [
					"Keep help/output rendering deterministic and testable.",
					"Keep CLI UX concerns separate from parser data structures where possible.",
					"Use the framework bin only for build/dev workflows; product commands live in `packages/cli`.",
				],
				avoid: [
					"Do not write product-specific copy in the framework.",
					"Do not introduce terminal UI libraries here unless all consumers need them.",
				],
				validate: ["`bun --cwd packages/cli-framework typecheck`"],
			},
		},
	},
	{
		key: "db",
		title: "@superset/db",
		layers: {
			backend: {
				scope: "Cloud Postgres schema, Neon Drizzle clients, relations, Zod payload schemas, seed helpers, and SQL utilities.",
				source: [
					"`packages/db/src/client.ts` creates `db` and `dbWs` with Neon and `casing: \"snake_case\"`.",
					"`packages/db/src/schema/schema.ts` defines product tables with indexes and inferred types.",
					"`packages/db/src/schema/auth.ts`, `github.ts`, `ingest.ts`, and `relations.ts` split schema domains.",
					"`packages/db/src/utils/sql.ts` and `membership.ts` hold reusable database helpers.",
				],
				patterns: [
					"Use Drizzle schema APIs and exported inferred types; avoid hand-written row interfaces.",
					"Keep JSON payload validation in `schema/zod.ts` and JSON TypeScript shapes in `schema/types.ts`.",
					"Name indexes and uniqueness constraints explicitly.",
					"Use `dbWs.transaction` where follow-up reads need transaction IDs or WebSocket-compatible behavior.",
				],
				cross: [
					"`packages/trpc` owns cloud RPC access to these tables.",
					"`apps/electric-proxy` and desktop/mobile collections depend on stable schema names and organization scoping.",
				],
				avoid: [
					"Do not manually edit `packages/db/drizzle/` artifacts.",
					"Do not touch production database state without explicit confirmation.",
					"Do not put local desktop-only state into cloud schema.",
				],
				validate: ["`bun --cwd packages/db typecheck`", "After schema edits, ask the user to run the Drizzle generate command on a Neon branch."],
			},
			frontend: {
				scope: "Types and schemas consumed by frontend packages through package exports.",
				source: [
					"`packages/db/src/index.ts` exports schema and helpers.",
					"`packages/db/src/schema/zod.ts` exports serializable config schemas.",
					"`packages/trpc/src/root.ts` exports `RouterInputs` and `RouterOutputs` built from DB-backed routers.",
				],
				patterns: [
					"Consume DB-backed data through tRPC, Electric/TanStack collections, or exported types; do not query cloud DB from client components.",
					"Use exported Zod schemas for config payload validation rather than re-declaring shapes in UI.",
					"Keep client-safe exports free of server-only database clients.",
				],
				avoid: [
					"Do not import `@superset/db/client` into browser or renderer UI.",
					"Do not duplicate enum string unions in frontend code when the package exports values.",
				],
				validate: ["`bun --cwd packages/db typecheck`", "Run consuming package typecheck when changing exported types."],
			},
		},
	},
	{
		key: "email",
		title: "@superset/email",
		layers: {
			frontend: {
				scope: "React Email templates, shared email components, Tailwind email config, and email maintenance scripts.",
				source: [
					"`packages/email/src/emails/contact-inquiry.tsx` and `enterprise-inquiry.tsx` are form-driven templates.",
					"`packages/email/src/emails/member-added.tsx` and billing variants show account lifecycle emails.",
					"`packages/email/src/components/index.ts` exports shared email components.",
					"`packages/email/scripts/notify-disconnected-integrations.ts` is a script-side email workflow.",
				],
				patterns: [
					"Export templates from `./emails/*` and keep each template in `src/emails/<name>.tsx`.",
					"Use React Email components and the package Tailwind config; email CSS must remain email-client friendly.",
					"Use typed props and keep provider/env logic outside template components.",
					"Preview with the package `dev` script and export with `email export` when needed.",
				],
				avoid: [
					"Do not call Resend directly from templates.",
					"Do not rely on app-only CSS in email markup.",
					"Do not hard-code production URLs when an env/config value exists.",
				],
				validate: ["`bun --cwd packages/email typecheck`", "`bun --cwd packages/email export` when template rendering changes significantly."],
			},
		},
	},
	{
		key: "host-service",
		title: "@superset/host-service",
		layers: {
			backend: {
				scope: "Local Hono service, host SQLite DB, git/filesystem/chat runtimes, terminal WebSockets, event bus, daemon supervisor, and host-service tRPC routers.",
				source: [
					"`packages/host-service/src/app.ts` composes API clients, DB, GitWatcher, EventBus, runtime managers, terminal routes, and tRPC context.",
					"`packages/host-service/src/trpc/router/router.ts` mounts local routers.",
					"`packages/host-service/src/terminal/terminal.ts` bridges workspace terminal WebSockets to pty-daemon sessions.",
					"`packages/host-service/src/daemon/DaemonSupervisor.ts` supervises daemon lifecycle.",
					"`packages/host-service/test/integration/*.integration.test.ts` covers local service workflows.",
				],
				patterns: [
					"Keep production construction in `createApp` but make every external dependency injectable for tests.",
					"Use provider interfaces under `src/providers` for auth, host auth, credentials, and model resolution.",
					"Keep runtime managers under `src/runtime/<domain>`; routers should orchestrate but not own long-running runtime state.",
					"Protect WebSocket routes with `hostAuth`; remote-control uses session HMAC inside its route rather than the generic `/terminal/*` auth middleware.",
					"Maintain Electron isolation. `src/no-electron-coupling.test.ts` should keep passing.",
				],
				cross: [
					"Desktop main starts and coordinates host-service; renderer uses typed clients, not direct server imports.",
					"Host-service consumes pty-daemon protocol and should not import daemon internals beyond public exports.",
				],
				avoid: [
					"Do not import Electron APIs into host-service.",
					"Do not block startup on optional background sweeps.",
					"Do not add cloud-only database assumptions to the host SQLite schema.",
				],
				validate: [
					"`bun --cwd packages/host-service test` for unit tests.",
					"Run targeted `packages/host-service/test/integration/*` tests for workflow changes.",
					"`bun --cwd packages/host-service typecheck`.",
				],
			},
			frontend: {
				scope: "Client-facing host-service contracts used by desktop renderer, CLI, and workspace clients.",
				source: [
					"`packages/host-service/src/api/createApiClient/createApiClient.ts` wraps cloud API access.",
					"`packages/host-service/src/events/types.ts` defines event bus payloads.",
					"`packages/host-service/src/types.ts` exports service contracts.",
					"`apps/desktop/src/renderer/lib/host-service-client.ts` consumes host-service from the renderer side.",
				],
				patterns: [
					"Keep exported types and route payloads stable and serializable.",
					"Add event kinds in the host-service event type map and update all consumers together.",
					"Renderer-facing errors should be actionable and copyable in desktop UI.",
				],
				avoid: [
					"Do not leak raw provider credentials into renderer contracts.",
					"Do not make renderer code depend on host-service private file paths.",
				],
				validate: ["`bun --cwd packages/host-service typecheck`", "Run desktop typecheck when exported host contracts change."],
			},
		},
	},
	{
		key: "local-db",
		title: "@superset/local-db",
		layers: {
			backend: {
				scope: "Desktop-local SQLite schema, relations, generated migrations, and Zod validation for local settings and workspace state.",
				source: [
					"`packages/local-db/src/schema/schema.ts` defines projects, worktrees, workspaces, sections, and settings.",
					"`packages/local-db/src/schema/zod.ts` owns typed JSON payload schemas.",
					"`packages/local-db/drizzle/` contains generated migration artifacts.",
				],
				patterns: [
					"Use `sqliteTable`, text IDs with `uuidv4()` defaults, integer timestamps, and integer booleans for local data.",
					"Keep comments for constraints Drizzle cannot express, such as partial unique indexes.",
					"Export inferred insert/select types next to tables.",
					"Keep local schema focused on user/machine state; cloud state belongs in `packages/db`.",
				],
				avoid: [
					"Do not manually reshape generated migration snapshots.",
					"Do not store secrets in local DB columns unless the host-service security model explicitly covers them.",
					"Do not duplicate cloud schema tables locally unless they are offline/cache state.",
				],
				validate: ["`bun --cwd packages/local-db typecheck`", "Run desktop tests for local DB consumers when schema changes."],
			},
			frontend: {
				scope: "Types and schemas from local-db consumed by desktop renderer and local data flows.",
				source: [
					"`packages/local-db/src/index.ts` re-exports schema, relations, and Zod modules.",
					"`apps/desktop/src/renderer/stores/*.ts` stores UI state that complements local DB state.",
				],
				patterns: [
					"Consume exported local-db types instead of retyping settings/workspace rows in UI.",
					"Keep validation of JSON settings aligned with `schema/zod.ts`.",
					"Use local DB for durable machine state, not transient UI state better handled by Zustand.",
				],
				avoid: [
					"Do not import server-only DB clients into renderer components.",
					"Do not fork local settings types in desktop stores.",
				],
				validate: ["`bun --cwd packages/local-db typecheck`", "Run desktop typecheck when local-db exports change."],
			},
		},
	},
	{
		key: "macos-process-metrics",
		title: "@superset/macos-process-metrics",
		layers: {
			frontend: {
				scope: "Optional native Node addon for macOS process metrics consumed by desktop resource monitoring.",
				source: [
					"`packages/macos-process-metrics/src/addon.cc` implements native bindings.",
					"`packages/macos-process-metrics/index.js` loads the built addon.",
					"`packages/macos-process-metrics/index.d.ts` exposes TypeScript types.",
					"`packages/macos-process-metrics/package.json` runs `node-gyp rebuild || echo ...` so non-macOS installs do not fail hard.",
				],
				patterns: [
					"Keep the addon optional and macOS-specific; installs on unsupported platforms must degrade gracefully.",
					"Update `index.d.ts` whenever the native export shape changes.",
					"Keep desktop consumers prepared for addon unavailability.",
				],
				avoid: [
					"Do not make package install fail on non-macOS CI.",
					"Do not import this addon into web, mobile, or serverless apps.",
				],
				validate: ["Install/build on macOS when native code changes.", "Run desktop resource metrics tests or manual checks for consumers."],
			},
		},
	},
	{
		key: "mcp",
		title: "@superset/mcp",
		layers: {
			backend: {
				scope: "Original MCP server package, auth helpers, in-memory state, and tool registration.",
				source: [
					"`packages/mcp/src/server.ts` builds the MCP server.",
					"`packages/mcp/src/auth.ts` owns MCP auth helpers.",
					"`packages/mcp/src/tools/index.ts` registers tools.",
					"`packages/mcp/src/in-memory.ts` contains in-memory support state.",
				],
				patterns: [
					"Keep MCP auth and server creation in package exports; app packages should call exports rather than duplicate setup.",
					"Use Zod schemas for tool inputs where the MCP SDK supports validation.",
					"Keep tool effects scoped and explicit because they may be invoked outside the web UI.",
				],
				avoid: [
					"Do not add v2 host-service tool logic here when `packages/mcp-v2` owns it.",
					"Do not skip auth checks for tools that touch organization data.",
				],
				validate: ["`bun --cwd packages/mcp test`", "`bun --cwd packages/mcp typecheck`"],
			},
			frontend: {
				scope: "Client-safe MCP types and package exports consumed by API or UI surfaces.",
				source: [
					"`packages/mcp/package.json` exposes `.`, `./auth`, and `./in-memory`.",
					"`apps/api/package.json` depends on `@superset/mcp`.",
				],
				patterns: [
					"Keep exports intentional and typed. Do not expose server internals accidentally.",
					"Prefer shared types over UI-local tool payload definitions.",
				],
				avoid: [
					"Do not import Node-only server setup into browser bundles.",
					"Do not duplicate MCP auth payload shapes in app code.",
				],
				validate: ["`bun --cwd packages/mcp typecheck`", "Run consuming app typecheck when exports change."],
			},
		},
	},
	{
		key: "mcp-v2",
		title: "@superset/mcp-v2",
		layers: {
			backend: {
				scope: "Current MCP v2 server, tool definitions, host-service bridge, caller context, and automation/workspace/project/host/agent tools.",
				source: [
					"`packages/mcp-v2/src/define-tool.ts` defines the local tool definition pattern.",
					"`packages/mcp-v2/src/server.ts` and `caller.ts` wire server and caller behavior.",
					"`packages/mcp-v2/src/host-service-client.ts` bridges local host-service access.",
					"`packages/mcp-v2/src/tools/automations/*.ts`, `workspaces/*.ts`, `hosts/list.ts`, and `agents/*.ts` show domain tool layout.",
				],
				patterns: [
					"Add tools under `src/tools/<domain>/<action>.ts` and register them through `src/tools/register.ts`.",
					"Keep input schemas and returned payloads typed and serializable.",
					"Use context helpers from `context-utils.ts` instead of ad hoc access to caller state.",
					"Use the host-service client when a tool needs local machine operations; keep cloud API calls separate.",
				],
				avoid: [
					"Do not put UI-specific copy or renderer assumptions into tools.",
					"Do not bypass tool registration when adding a new action.",
					"Do not make automation tools mutate state without clear tool input validation.",
				],
				validate: ["`bun --cwd packages/mcp-v2 typecheck`", "Run tool-specific tests when added."],
			},
			frontend: {
				scope: "Typed MCP v2 tool contracts surfaced to chat/agent UI and API integrations.",
				source: [
					"`packages/mcp-v2/src/index.ts` controls exported surface.",
					"`packages/mcp-v2/src/tools/register.ts` is the discoverable tool registry.",
				],
				patterns: [
					"Keep tool names, descriptions, and payload shapes stable because agent UI and automation flows rely on them.",
					"Expose only the types/helpers a consumer needs through `index.ts`.",
				],
				avoid: [
					"Do not make consumers import from deep private tool paths unless the package exports them.",
					"Do not return non-serializable values from tool calls.",
				],
				validate: ["`bun --cwd packages/mcp-v2 typecheck`", "Run consumers that render MCP tool results when payloads change."],
			},
		},
	},
	{
		key: "panes",
		title: "@superset/panes",
		layers: {
			backend: {
				scope: "Runtime-neutral pane model types and layout contracts shared with the React pane implementation.",
				source: [
					"`packages/panes/src/types.ts` owns core pane types.",
					"`packages/panes/src/index.ts` exposes package entry points.",
					"`packages/panes/README.md` documents package intent.",
				],
				patterns: [
					"Keep core types free of React and DOM dependencies.",
					"Model pane state with explicit discriminated types so stores can update safely.",
					"Update React layer and tests when core type contracts change.",
				],
				avoid: [
					"Do not import `@superset/ui` or React into core type files.",
					"Do not use broad `any` for pane payloads.",
				],
				validate: ["`bun --cwd packages/panes test`", "`bun --cwd packages/panes typecheck`"],
			},
			frontend: {
				scope: "React DnD pane components and hooks built on the core pane model.",
				source: [
					"`packages/panes/src/react/index.ts` exports React integration.",
					"`packages/panes/src/react/types.ts` defines React-specific pane types.",
					"`packages/panes/package.json` declares React peer dependency and `react-dnd` usage.",
				],
				patterns: [
					"Keep React-specific behavior under `src/react`.",
					"Use `@superset/ui` shared components when rendering reusable controls.",
					"Keep drag/drop state predictable and externally controlled where possible.",
				],
				avoid: [
					"Do not couple React pane code to a single app route.",
					"Do not duplicate core pane types in desktop stores.",
				],
				validate: ["`bun --cwd packages/panes test`", "`bun --cwd packages/panes typecheck`"],
			},
		},
	},
	{
		key: "port-scanner",
		title: "@superset/port-scanner",
		layers: {
			backend: {
				scope: "Port scanning, process discovery, static port definitions, and process tree helpers.",
				source: [
					"`packages/port-scanner/src/scanner.ts` scans ports.",
					"`packages/port-scanner/src/procfs.ts` implements Linux procfs helpers.",
					"`packages/port-scanner/src/port-manager.ts` coordinates port allocations.",
					"`packages/port-scanner/src/*.test.ts` covers scanner, procfs, and manager behavior.",
				],
				patterns: [
					"Keep OS-specific code isolated, as procfs-specific logic is in `procfs.ts`.",
					"Use typed result objects from `types.ts` and central static constants from `static-ports.ts`.",
					"Add tests for platform edge cases and process tree behavior.",
				],
				avoid: [
					"Do not shell out from call sites when this package already exposes a scanner/helper.",
					"Do not assume Linux procfs is present on macOS.",
				],
				validate: ["`bun --cwd packages/port-scanner test`", "`bun --cwd packages/port-scanner typecheck`"],
			},
			frontend: {
				scope: "Typed port information consumed by desktop UI and host-service clients.",
				source: [
					"`packages/port-scanner/src/types.ts` defines exported port/process shapes.",
					"`apps/desktop/src/renderer` surfaces ports through host-service routes.",
				],
				patterns: [
					"Keep exported shapes stable and serializable.",
					"Convert scanner details into UI-ready copy at the UI boundary, not inside scanner internals.",
				],
				avoid: [
					"Do not import Node process scanning code into browser bundles.",
					"Do not expose platform-specific raw parser details to UI components.",
				],
				validate: ["`bun --cwd packages/port-scanner typecheck`", "Run desktop typecheck when exported types change."],
			},
		},
	},
	{
		key: "pty-daemon",
		title: "@superset/pty-daemon",
		layers: {
			backend: {
				scope: "Standalone Node PTY daemon, Unix socket protocol, session store, handlers, server loop, flow control, and upgrade handoff.",
				source: [
					"`packages/pty-daemon/README.md` is the authoritative package design guide.",
					"`packages/pty-daemon/src/protocol/messages.ts` defines protocol messages.",
					"`packages/pty-daemon/src/protocol/framing.ts` implements length-prefixed JSON plus binary payload framing.",
					"`packages/pty-daemon/src/Server/Server.ts` implements socket lifecycle, flow control, and fd handoff.",
					"`packages/pty-daemon/test/no-encoding-hops.test.ts` guards byte fidelity source-level invariants.",
				],
				patterns: [
					"Keep the package standalone; no imports from host-service or app packages.",
					"Run daemon runtime under Node, not Bun. Bun is for build/unit tests.",
					"Keep binary PTY data out of JSON; use frame payload tails.",
					"Preserve 0600 Unix socket auth boundary and versioned handshake.",
					"Use pure handlers in `src/handlers` for control-plane operations where practical.",
				],
				cross: [
					"Host-service consumes the public protocol and DaemonClient. Coordinate protocol changes with `packages/host-service/src/terminal/DaemonClient`.",
					"Desktop packaging supervises daemon through `apps/desktop/src/main/pty-daemon`.",
				],
				avoid: [
					"Do not add persistence to daemon session buffers.",
					"Do not reintroduce base64 or per-chunk UTF-8 decoding on the byte path.",
					"Do not add business rules to daemon sessions; the daemon is protocol and PTY ownership only.",
				],
				validate: [
					"`bun --cwd packages/pty-daemon test`",
					"`bun --cwd packages/pty-daemon run test:integration` for real PTY/handoff changes.",
					"`bun --cwd packages/pty-daemon typecheck`",
				],
			},
			frontend: {
				scope: "Public protocol types and client-facing terminal session semantics consumed by host-service and desktop renderer.",
				source: [
					"`packages/pty-daemon/src/index.ts` controls public exports.",
					"`packages/pty-daemon/src/protocol/index.ts` exports protocol helpers.",
					"`apps/desktop/src/main/terminal-host/*.ts` and host-service terminal routes consume terminal session semantics.",
				],
				patterns: [
					"Keep protocol types explicit and discriminated by `type`.",
					"Update host-service and renderer consumers when adding a server/client message.",
					"Document byte-level behavior in code comments and tests because UI regressions are otherwise subtle.",
				],
				avoid: [
					"Do not expose daemon-private SessionStore state as a UI contract.",
					"Do not let renderer code depend on daemon filesystem paths.",
				],
				validate: ["`bun --cwd packages/pty-daemon typecheck`", "Run host-service and desktop terminal tests for protocol changes."],
			},
		},
	},
	{
		key: "sdk",
		title: "@superset/sdk",
		layers: {
			backend: {
				scope: "TypeScript SDK core request machinery, generated-style resources, upload helpers, platform shims, and public package build.",
				source: [
					"`packages/sdk/src/client.ts` and `src/index.ts` define public SDK entry points.",
					"`packages/sdk/src/core/resource.ts` and `api-promise.ts` define resource base behavior.",
					"`packages/sdk/src/internal/parse.ts`, `request-options.ts`, and `errors.ts` own request internals.",
					"`packages/sdk/src/resources/*.ts` define resource groups such as agents, automations, hosts, projects, tasks, and workspaces.",
				],
				patterns: [
					"Keep public exports stable and generated-friendly.",
					"Use internal helpers for request parsing, headers, uploads, and platform detection instead of duplicating fetch logic in resources.",
					"Keep resource methods thin wrappers around core request behavior.",
					"Update `api.md` and README when public SDK behavior changes.",
				],
				avoid: [
					"Do not leak internal shim types into the public API.",
					"Do not make SDK resources depend on app-specific runtime globals.",
					"Do not skip build validation for publishable API changes.",
				],
				validate: ["`bun --cwd packages/sdk typecheck`", "`bun --cwd packages/sdk build` for public API/build changes."],
			},
			frontend: {
				scope: "Browser/client consumption of the SDK public API and resource types.",
				source: [
					"`packages/sdk/src/resources/index.ts` exports public resources.",
					"`packages/sdk/src/internal/detect-platform.ts` handles runtime platform detection.",
				],
				patterns: [
					"Keep browser-compatible code free of Node-only dependencies unless shims cover them.",
					"Return typed promises with predictable error classes from `core/error.ts`.",
					"Use SDK public types rather than duplicating API response shapes in apps.",
				],
				avoid: [
					"Do not import from `src/internal` in app code.",
					"Do not rely on undocumented resource paths.",
				],
				validate: ["`bun --cwd packages/sdk typecheck`", "`bun --cwd packages/sdk build`"],
			},
		},
	},
	{
		key: "shared",
		title: "@superset/shared",
		layers: {
			frontend: {
				scope: "Runtime-neutral constants, parsing utilities, terminal protocol helpers, agent definitions, billing helpers, and workspace-launch logic shared across apps/packages.",
				source: [
					"`packages/shared/src/constants.ts` owns cross-app constants and feature flags.",
					"`packages/shared/src/agent-*.ts` files own agent command, launch, catalog, identity, and settings helpers.",
					"`packages/shared/src/terminal-link-parsing/` and scanner files own terminal parsing logic.",
					"`packages/shared/src/workspace-launch/` owns branch/name/slug helpers.",
					"`packages/shared/package.json` exports each public subpath explicitly.",
				],
				patterns: [
					"Keep shared utilities runtime-neutral and side-effect light.",
					"Add or update explicit `package.json` exports when a utility becomes public.",
					"Add tests next to parsers and launch helpers; this package already has broad `*.test.ts` coverage.",
					"Centralize constants here when 2+ packages need the same value.",
				],
				avoid: [
					"Do not import app code, Electron, or database clients into shared utilities.",
					"Do not create a helper here for a one-off app concern.",
					"Do not change exported constants without searching all references first.",
				],
				validate: ["`bun --cwd packages/shared test`", "`bun --cwd packages/shared typecheck`"],
			},
		},
	},
	{
		key: "trpc",
		title: "@superset/trpc",
		layers: {
			backend: {
				scope: "Cloud application tRPC context, auth procedures, routers, organization resource guards, and inferred router types.",
				source: [
					"`packages/trpc/src/trpc.ts` defines context, superjson transformer, error formatter, and auth procedures.",
					"`packages/trpc/src/root.ts` mounts all domain routers and exports `RouterInputs`/`RouterOutputs`.",
					"`packages/trpc/src/router/v2-project/v2-project.ts` shows org-scoped JWT procedures and Drizzle transactions.",
					"`packages/trpc/src/router/utils/org-resource-access.ts` centralizes access checks.",
				],
				patterns: [
					"Use Zod `.input(...)` on procedures and return typed data directly from Drizzle queries.",
					"Use `TRPCError` with stable codes for auth, validation, and not-found failures.",
					"Use procedure type by auth mode: `publicProcedure`, `protectedProcedure`, `jwtProcedure`, or `adminProcedure`.",
					"Keep each router in `router/<domain>/<domain>.ts` plus `index.ts`, then mount it in `root.ts`.",
					"Use organization access helpers instead of repeating membership checks.",
				],
				cross: [
					"Apps consume `AppRouter`, `RouterInputs`, and `RouterOutputs` rather than duplicating API types.",
					"Cloud routers use `@superset/db`; local host-service routers live in `packages/host-service`.",
				],
				avoid: [
					"Do not perform organization-scoped resource reads without verifying org membership/access.",
					"Do not use raw unvalidated `input` objects.",
					"Do not put desktop-local workflows in the cloud tRPC package.",
				],
				validate: ["`bun --cwd packages/trpc test`", "`bun --cwd packages/trpc typecheck`"],
			},
			frontend: {
				scope: "Inferred router input/output types and tRPC client contracts consumed by web, desktop, mobile, and SDK surfaces.",
				source: [
					"`packages/trpc/src/root.ts` exports `RouterInputs` and `RouterOutputs`.",
					"`apps/desktop/src/renderer/lib/api-trpc-client.ts` consumes cloud tRPC from desktop.",
					"`apps/mobile/lib/trpc/client.ts` consumes tRPC from mobile.",
				],
				patterns: [
					"Use inferred types from `@superset/trpc` rather than hand-written response interfaces.",
					"Keep returned payloads serializable through superjson.",
					"Coordinate client cache invalidation when mutation outputs or query keys change.",
				],
				avoid: [
					"Do not import server router implementation files into React components.",
					"Do not duplicate router path strings when a generated client hook exists.",
				],
				validate: ["`bun --cwd packages/trpc typecheck`", "Run consuming app typecheck for router contract changes."],
			},
		},
	},
	{
		key: "ui",
		title: "@superset/ui",
		layers: {
			frontend: {
				scope: "Shared React UI library, shadcn components, AI elements, atoms, hooks, icons, CSS tokens, and low-level UI utilities.",
				source: [
					"`packages/ui/src/components/ui/button.tsx` shows shadcn/cva component style.",
					"`packages/ui/src/components/ai-elements/message.tsx` and `message.test.tsx` show AI element testing.",
					"`packages/ui/src/atoms/Avatar/Avatar.tsx` shows atom exports.",
					"`packages/ui/src/components/overflow-fade/OverflowFadeText/OverflowFadeText.tsx` shows folder-based local components.",
					"`packages/ui/src/lib/utils.ts` exports `cn` with `clsx` and `tailwind-merge`.",
				],
				patterns: [
					"Keep shadcn components in `src/components/ui/*.tsx` as kebab-case single files so the shadcn CLI can update them.",
					"Keep AI elements in `src/components/ai-elements/*.tsx` and test behavioral components.",
					"Use folder-based components for custom shared components outside shadcn exceptions.",
					"Use `cva` for variants where variants are part of the component API.",
					"Export shared icons from `src/assets/icons/preset-icons/index.ts`.",
				],
				avoid: [
					"Do not fork shadcn primitives inside apps when a shared UI package component exists.",
					"Do not add app-specific business logic to `@superset/ui`.",
					"Do not bypass `cn` when merging conditional Tailwind classes.",
				],
				validate: ["`bun --cwd packages/ui test`", "`bun --cwd packages/ui typecheck`"],
			},
		},
	},
	{
		key: "workspace-client",
		title: "@superset/workspace-client",
		layers: {
			backend: {
				scope: "Typed host-service/workspace client helpers, event bus client, relay affinity priming, and workspace tRPC bridge.",
				source: [
					"`packages/workspace-client/src/workspace-trpc.ts` defines workspace tRPC client integration.",
					"`packages/workspace-client/src/lib/eventBus.ts` owns event bus client behavior.",
					"`packages/workspace-client/src/lib/primeRelayAffinity.ts` handles relay affinity priming.",
				],
				patterns: [
					"Keep host-service communication typed and routed through this package where shared clients are needed.",
					"Use superjson/tRPC clients consistently with host-service contracts.",
					"Keep relay affinity logic isolated so UI callers do not need tunnel details.",
				],
				avoid: [
					"Do not duplicate host-service client setup in multiple apps.",
					"Do not expose raw auth tokens through event bus helpers.",
				],
				validate: ["`bun --cwd packages/workspace-client typecheck`"],
			},
			frontend: {
				scope: "React Query/tRPC workspace client exports consumed by renderer and web-like clients.",
				source: [
					"`packages/workspace-client/src/index.ts` exports the package surface.",
					"`packages/workspace-client/package.json` declares React Query and tRPC peer/client dependencies.",
				],
				patterns: [
					"Keep React-facing client helpers compatible with React peer dependency.",
					"Use exported hooks/clients rather than deep imports from apps.",
					"Coordinate cache behavior with consuming route providers.",
				],
				avoid: [
					"Do not import desktop renderer components into the client package.",
					"Do not create app-specific query keys here unless they are shared.",
				],
				validate: ["`bun --cwd packages/workspace-client typecheck`", "Run consuming app typecheck for client API changes."],
			},
		},
	},
	{
		key: "workspace-fs",
		title: "@superset/workspace-fs",
		layers: {
			backend: {
				scope: "Workspace filesystem service core, host implementation, search/cache/watch logic, resource URI handling, and throttled worker.",
				source: [
					"`packages/workspace-fs/src/core/service.ts` defines core service behavior.",
					"`packages/workspace-fs/src/host/service.ts` implements host-side filesystem service.",
					"`packages/workspace-fs/src/search.ts`, `watch.ts`, and cache tests cover file search/watch behavior.",
					"`packages/workspace-fs/src/resource-uri.ts` owns resource URI parsing and formatting.",
				],
				patterns: [
					"Keep host filesystem side effects under `src/host` and client-safe contracts under `src/client`/`src/core`.",
					"Use `resource-uri.ts` helpers for resource identifiers; do not parse URIs ad hoc.",
					"Keep search and watch caches bounded; preserve eviction/growth tests when changing caches.",
					"Add tests for path normalization, watcher behavior, and error messages.",
				],
				avoid: [
					"Do not let browser/client code import host filesystem modules.",
					"Do not hand-roll fuzzy scoring when `fuzzy-scorer.ts` applies.",
					"Do not return raw Node errors to UI without mapping through `error-message.ts`.",
				],
				validate: ["`bun --cwd packages/workspace-fs test`", "`bun --cwd packages/workspace-fs typecheck`"],
			},
			frontend: {
				scope: "Client-side workspace filesystem contracts and resource URI helpers consumed by desktop/chat UI.",
				source: [
					"`packages/workspace-fs/src/client/index.ts` exports client helpers.",
					"`packages/workspace-fs/src/types.ts` defines shared file/search/watch types.",
					"`packages/chat/src/server/trpc/utils/file-search/file-search.ts` consumes workspace-fs search behavior.",
				],
				patterns: [
					"Use typed client exports and resource URI helpers in UI/client code.",
					"Keep file paths display-friendly at the UI layer while preserving raw paths in service types.",
					"Throttle expensive search/watch interactions through existing utilities.",
				],
				avoid: [
					"Do not import `src/host` into renderer components.",
					"Do not duplicate file tree or search cache logic in chat UI.",
				],
				validate: ["`bun --cwd packages/workspace-fs test`", "`bun --cwd packages/workspace-fs typecheck`"],
			},
		},
	},
	{
		key: "admin",
		title: "@superset/admin",
		layers: {
			frontend: {
				scope: "Next.js admin dashboard, protected dashboard route group, charts, metric cards, week/time pickers, and PostHog user identification.",
				source: [
					"`apps/admin/src/app/(dashboard)/page.tsx` composes dashboard sections.",
					"`apps/admin/src/app/(dashboard)/components/MetricCard/MetricCard.tsx` shows local component folder pattern.",
					"`apps/admin/src/app/(dashboard)/components/*Chart/*Chart.tsx` owns chart components.",
					"`apps/admin/src/proxy.ts` uses Next 16 proxy for request interception.",
				],
				patterns: [
					"Keep dashboard-only components under `src/app/(dashboard)/components/<Component>/<Component>.tsx` plus `index.ts`.",
					"Use shared `@superset/ui` primitives for common controls before adding local UI.",
					"Keep global app providers in `src/app/providers.tsx` and app layout in `layout.tsx`.",
					"Use `proxy.ts`, not `middleware.ts`.",
				],
				avoid: [
					"Do not promote dashboard-only cards/charts to root `src/components`.",
					"Do not duplicate auth proxy logic from web if a shared pattern applies.",
				],
				validate: ["`bun --cwd apps/admin typecheck`", "`bun --cwd apps/admin build` for route/proxy changes when feasible."],
			},
		},
	},
	{
		key: "api",
		title: "@superset/api",
		layers: {
			frontend: {
				scope: "Next.js API app for tRPC, MCP/OAuth endpoints, instrumentation, proxy, and server-side integration code.",
				source: [
					"`apps/api/src/trpc/context.ts` builds API tRPC context.",
					"`apps/api/src/proxy.ts` is the Next 16 interception file.",
					"`apps/api/src/lib/oauth-state.ts`, `oauth-metadata.ts`, and `relay-url.ts` isolate API helpers.",
					"`apps/api/MCP_TOOLS.md` documents API MCP tool behavior.",
				],
				patterns: [
					"Although Trellis labels this layer frontend, treat this app as server-heavy Next API code.",
					"Keep route handlers under `src/app` and reusable server helpers under `src/lib`.",
					"Use validated env from `src/env.ts` and Sentry instrumentation files already present.",
					"Use `proxy.ts`, not `middleware.ts`.",
				],
				avoid: [
					"Do not put browser UI components in this app.",
					"Do not bypass shared `@superset/trpc`, `@superset/auth`, `@superset/mcp`, or `@superset/mcp-v2` packages for duplicated API logic.",
				],
				validate: ["`bun --cwd apps/api typecheck`", "`bun --cwd apps/api build` for route/runtime changes when feasible."],
			},
		},
	},
	{
		key: "desktop",
		title: "@superset/desktop",
		layers: {
			backend: {
				scope: "Electron main process, packaged host-service/pty-daemon coordination, main-process tRPC routers, preload bridge, terminal host, auto update, menus, and OS integrations.",
				source: [
					"`apps/desktop/AGENTS.md` and `CLAUDE.md` define desktop-specific IPC and error-selection rules.",
					"`apps/desktop/src/lib/trpc/routers/index.ts` composes Electron IPC routers.",
					"`apps/desktop/src/main/lib/host-service-coordinator.ts` coordinates host-service lifecycle.",
					"`apps/desktop/src/main/terminal-host/terminal-host.ts` and tests own main-process terminal hosting.",
					"`apps/desktop/src/preload/index.ts` is the renderer bridge boundary.",
				],
				patterns: [
					"Use tRPC for Electron IPC; do not add ad hoc IPC channels.",
					"For `trpc-electron` subscriptions, use `observable` from `@trpc/server/observable`, not async generators.",
					"Use aliases from `tsconfig.json` where possible.",
					"Keep host-service and pty-daemon lifecycle code in main process libraries, not renderer components.",
					"Add focused tests for OS/process/terminal behavior under `src/main/**/*.test.ts`.",
				],
				cross: [
					"Host-service local runtime belongs in `packages/host-service`; desktop main coordinates it.",
					"Pty daemon protocol belongs in `packages/pty-daemon`; desktop packages and supervises it.",
				],
				avoid: [
					"Do not bypass tRPC for new Electron IPC.",
					"Do not put renderer-only state in main-process modules.",
					"Do not decode terminal byte streams in ways that break UTF-8 or binary fidelity.",
				],
				validate: ["`bun --cwd apps/desktop test`", "`bun --cwd apps/desktop typecheck`"],
			},
			frontend: {
				scope: "Electron renderer routes, TanStack Router screens, local components/hooks/providers/stores, command palette, React Query, TanStack DB collections, and desktop UI behavior.",
				source: [
					"`apps/desktop/src/renderer/routes/_authenticated/layout.tsx` and route files show route organization.",
					"`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` owns collection provider setup.",
					"`apps/desktop/src/renderer/stores/README.md` defines Zustand store conventions.",
					"`apps/desktop/src/renderer/routes/_authenticated/settings/account/components/AccountSettings/AccountSettings.tsx` shows cache-first `useLiveQuery` rendering.",
					"`apps/desktop/src/renderer/lib/electron-trpc.ts` and `api-trpc-client.ts` separate local IPC and cloud API clients.",
				],
				patterns: [
					"Co-locate route-specific components, hooks, providers, and utils under the route folder.",
					"Use Zustand stores in `src/renderer/stores` for local UI state with typed selectors and devtools where useful.",
					"Use TanStack DB cache-first rendering: show existing rows even when `isReady` is false.",
					"Make error text selectable with `select-text cursor-text` when users may need to copy it.",
					"Keep cloud API calls through `apiTrpcClient` and Electron IPC through `electronTrpc`.",
				],
				avoid: [
					"Do not blank cached live-query data while collections reconnect.",
					"Do not import Electron main modules into renderer routes.",
					"Do not place route-only components in global `components` directories.",
				],
				validate: ["`bun --cwd apps/desktop test`", "`bun --cwd apps/desktop typecheck`"],
			},
		},
	},
	{
		key: "docs",
		title: "@superset/docs",
		layers: {
			frontend: {
				scope: "Fumadocs/Next documentation site, MDX content, generated source files, shared layout, metadata routes, and public docs images.",
				source: [
					"`apps/docs/content/docs/*.mdx` contains documentation content.",
					"`apps/docs/source.config.ts` and `.source/*` configure/generated docs source.",
					"`apps/docs/src/lib/source.ts` and `layout.shared.tsx` wire docs UI.",
					"`apps/docs/package.json` runs `fumadocs-mdx` before build/typecheck.",
				],
				patterns: [
					"Put product docs in `content/docs` and keep `meta.json` navigation updated.",
					"Use docs images from `public/images/` when screenshots are referenced.",
					"Run `fumadocs-mdx` through package scripts before typechecking.",
					"Keep MDX components in `src/mdx-components.tsx`.",
				],
				avoid: [
					"Do not edit generated `.source` files manually unless the docs tooling requires it.",
					"Do not duplicate layout constants outside `src/lib/layout.shared.tsx`.",
				],
				validate: ["`bun --cwd apps/docs typecheck`", "`bun --cwd apps/docs build` for docs routing/config changes."],
			},
		},
	},
	{
		key: "electric-proxy",
		title: "electric-proxy",
		layers: {
			backend: {
				scope: "Cloudflare Worker proxy for Electric SQL shapes, authentication, where-clause handling, and Electric client access.",
				source: [
					"`apps/electric-proxy/src/index.ts` is the Worker entry.",
					"`apps/electric-proxy/src/auth.ts` validates access.",
					"`apps/electric-proxy/src/electric.ts` integrates Electric client behavior.",
					"`apps/electric-proxy/src/where.ts` builds/validates where constraints.",
					"`apps/electric-proxy/wrangler.jsonc` configures deployment.",
				],
				patterns: [
					"Keep Worker code runtime-compatible with Cloudflare Workers.",
					"Validate auth and shape filters before forwarding to Electric.",
					"Use shared DB schema names from `@superset/db` instead of stringly typed table copies where possible.",
					"Keep request/response types in `types.ts`.",
				],
				avoid: [
					"Do not use Node-only APIs in Worker runtime.",
					"Do not expose unrestricted Electric shapes without auth and where scoping.",
				],
				validate: ["`bun --cwd apps/electric-proxy typecheck`", "`bun --cwd apps/electric-proxy deploy` only when explicitly releasing."],
			},
			frontend: {
				scope: "Electric proxy contracts consumed by TanStack DB/Electric collection setup in desktop and mobile.",
				source: [
					"`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts` consumes Electric-backed collections.",
					"`apps/mobile/lib/collections/collections.ts` sets up mobile collections.",
				],
				patterns: [
					"Coordinate shape names and auth assumptions with collection providers.",
					"Preserve cache-first UI behavior when proxy readiness changes.",
				],
				avoid: [
					"Do not make frontend code rely on unscoped Electric data.",
					"Do not duplicate proxy where-clause construction in UI components.",
				],
				validate: ["`bun --cwd apps/electric-proxy typecheck`", "Run consuming desktop/mobile typecheck for contract changes."],
			},
		},
	},
	{
		key: "marketing",
		title: "@superset/marketing",
		layers: {
			frontend: {
				scope: "Next.js marketing site, content pages, blog/changelog utilities, contact/enterprise actions, landing-page sections, SEO routes, and analytics.",
				source: [
					"`apps/marketing/src/app/components/HeroSection/HeroSection.tsx` and route-local components define landing sections.",
					"`apps/marketing/src/app/blog/components/BlogCard/BlogCard.tsx` shows content card structure.",
					"`apps/marketing/src/app/contact/actions.ts` validates, sanitizes, rate-limits, and sends contact emails.",
					"`apps/marketing/src/lib/blog.ts`, `changelog.ts`, `compare.ts`, and `marketplace.ts` own content data access.",
				],
				patterns: [
					"Keep reusable marketing sections under `src/app/components/<Component>`; keep page-specific components under the page route.",
					"Use server actions for forms and sanitize all submitted strings before sending email.",
					"Keep content parsing/data utilities in `src/lib` and route rendering in `src/app`.",
					"Use metadata routes such as `robots.ts`, `sitemap.ts`, `feed.xml/route.ts`, and `llms.txt/route.ts` for SEO/documentation outputs.",
				],
				avoid: [
					"Do not send raw form input to Resend or email templates.",
					"Do not put content parsing logic directly into page components.",
					"Do not create `middleware.ts`; use `proxy.ts` if request interception is needed.",
				],
				validate: ["`bun --cwd apps/marketing typecheck`", "`bun --cwd apps/marketing build` for route/content pipeline changes."],
			},
		},
	},
	{
		key: "mobile",
		title: "@superset/mobile",
		layers: {
			frontend: {
				scope: "Expo React Native app, expo-router route files, screen components, mobile shadcn-style UI, auth, collections, PostHog, and tRPC clients.",
				source: [
					"`apps/mobile/AGENTS.md` defines the route/screen separation rule.",
					"`apps/mobile/app/(authenticated)/(home)/index.tsx` re-exports `WorkspacesScreen`.",
					"`apps/mobile/screens/(authenticated)/(home)/workspaces/WorkspacesScreen.tsx` owns UI and state.",
					"`apps/mobile/screens/(authenticated)/providers/CollectionsProvider/CollectionsProvider.tsx` builds collection context from active organization.",
					"`apps/mobile/components/ui/*.tsx` contains mobile shadcn-style primitives.",
				],
				patterns: [
					"`app/` owns routing, redirects, and layouts. UI/business logic goes under matching `screens/` folders.",
					"Mirror the route shape under `screens/` and export screens through `index.ts`.",
					"Keep providers and hooks under `screens/<scope>/providers` or `screens/<scope>/hooks` when they are scope-specific.",
					"Use mobile `components/ui` primitives; web `@superset/ui` components are not automatically React Native compatible.",
					"Use TanStack DB cache-first rendering with Electric-backed collections.",
				],
				avoid: [
					"Do not put full screen UI in route files except redirects/layout-only logic.",
					"Do not import web-only DOM components into mobile screens.",
					"Do not hide cached collection rows while readiness is false.",
				],
				validate: ["`bun --cwd apps/mobile typecheck`", "Run Expo/mobile app locally for navigation or native UI changes."],
			},
		},
	},
	{
		key: "relay",
		title: "@superset/relay",
		layers: {
			backend: {
				scope: "Hono Node relay service for tunnels, WebSocket routing, access/auth, directory state, Sentry, and deployment scripts.",
				source: [
					"`apps/relay/src/index.ts` is the service entry point.",
					"`apps/relay/src/tunnel.ts` owns tunnel behavior.",
					"`apps/relay/src/auth.ts` and `access.ts` validate access.",
					"`apps/relay/src/directory.ts` tracks relay directory state.",
					"`apps/relay/plans/20260420-relay-hardening.md` documents hardening context.",
				],
				patterns: [
					"Keep relay auth/access checks close to tunnel handling.",
					"Use shared tunnel protocol types from `@superset/shared` where possible.",
					"Keep deployment changes in `fly*.toml` and scripts under `scripts/`.",
					"Add smoke checks when changing tunnel routing or auth.",
				],
				avoid: [
					"Do not bypass relay access checks for synthetic or debug routes.",
					"Do not mix host-service local auth secrets into cloud relay config without explicit protocol design.",
				],
				validate: ["`bun --cwd apps/relay typecheck`", "`apps/relay/scripts/smoke-test.sh` for relay behavior changes when environment is available."],
			},
			frontend: {
				scope: "Relay URLs and status contracts consumed by desktop, host-service, and remote-control viewers.",
				source: [
					"`apps/relay/src/types.ts` defines relay types.",
					"`packages/workspace-client/src/lib/primeRelayAffinity.ts` consumes relay affinity behavior.",
					"`packages/host-service/src/tunnel/tunnel-client.ts` connects host-service to relay.",
				],
				patterns: [
					"Keep relay client-visible payloads serializable and version-tolerant.",
					"Coordinate tunnel protocol changes with `@superset/shared` and host-service tunnel client.",
				],
				avoid: [
					"Do not expose internal directory state as a public UI contract.",
					"Do not duplicate relay URL construction in multiple apps.",
				],
				validate: ["`bun --cwd apps/relay typecheck`", "Run host-service/desktop typecheck for contract changes."],
			},
		},
	},
	{
		key: "streams",
		title: "streams",
		layers: {
			frontend: {
				scope: "Reserved package shell. It currently contains only `package.json` and no source tree.",
				source: [
					"`apps/streams/package.json` is the only current file.",
				],
				patterns: [
					"Before adding code, decide whether this should be a Next app, service, or package and add the matching scripts/config.",
					"Follow monorepo Bun/Turbo conventions and create package-specific specs once ownership is real.",
				],
				avoid: [
					"Do not infer frontend architecture from the empty package shell.",
					"Do not add unused dependencies or generated scaffolding without a concrete product requirement.",
				],
				validate: ["No package validation exists yet; add scripts with the first real implementation."],
			},
		},
	},
	{
		key: "web",
		title: "@superset/web",
		layers: {
			frontend: {
				scope: "Main Next.js web app, auth proxy, route groups, agents UI preview, integrations/settings pages, PostHog user identification, and mobile terminal input.",
				source: [
					"`apps/web/src/proxy.ts` handles auth redirects and public route matching with Next 16 proxy.",
					"`apps/web/src/app/(agents)/components/SessionList/SessionList.tsx` shows route-local component organization.",
					"`apps/web/src/app/(agents)/utils/getAgentsUiAccess/getAgentsUiAccess.ts` shows server cached feature-flag access.",
					"`apps/web/src/app/(dashboard-legacy)/components/*` shows legacy dashboard route-local components.",
				],
				patterns: [
					"Use App Router route groups and local `components/`, `utils/`, `constants.ts`, and `mock-data.ts` inside the owning route group.",
					"Use `proxy.ts`, not `middleware.ts`, for auth interception.",
					"Keep auth redirects and public-route matching in proxy; keep server-only feature checks in cached server helpers.",
					"Use `@superset/ui` components and Tailwind tokens for shared UI.",
				],
				avoid: [
					"Do not move route-only agents/dashboard components to root `src/components`.",
					"Do not call PostHog feature flags from client components when server gating is required.",
					"Do not blank authenticated pages before proxy/session state resolves unless no cached data exists.",
				],
				validate: ["`bun --cwd apps/web typecheck`", "`bun --cwd apps/web build` for route/proxy changes when feasible."],
			},
		},
	},
	{
		key: "typescript",
		title: "@superset/typescript",
		layers: {
			frontend: {
				scope: "Shared TypeScript configuration package for internal packages, Electron, and Next.js apps.",
				source: [
					"`tooling/typescript/base.json` is the shared base config.",
					"`tooling/typescript/internal-package.json` is used by workspace packages.",
					"`tooling/typescript/electron.json` covers Electron-specific settings.",
					"`tooling/typescript/next.json` covers Next.js apps.",
				],
				patterns: [
					"Extend the appropriate shared config from package/app `tsconfig.json` files.",
					"Keep config changes broad and intentional; many packages inherit these files.",
					"Run broad typecheck after changing shared TS config.",
				],
				avoid: [
					"Do not add package-specific path aliases to shared configs unless every consumer should inherit them.",
					"Do not weaken strictness to work around one package error.",
				],
				validate: ["`bun run typecheck` after shared config changes."],
			},
		},
	},
];

const fallbackLayerGuides = {
	backend: {
		scope: "Backend/service responsibilities for this package. This layer exists because the package participates in server, CLI, worker, database, protocol, or service-side code paths.",
		source: [
			"Inspect the package source tree and exports before editing.",
			"Use the shared backend, database, and monorepo guides for cross-cutting rules.",
		],
		patterns: [
			"Keep service logic typed, testable, and scoped to the package boundary.",
			"Prefer existing package helpers and exported types over new local copies.",
			"Add tests for parser/protocol/database/runtime behavior when changing shared contracts.",
		],
		avoid: [
			"Do not import app UI code into backend packages.",
			"Do not duplicate cross-package constants or protocol shapes.",
		],
		validate: ["Run the package typecheck script if present.", "Run targeted tests for changed behavior."],
	},
	frontend: {
		scope: "Frontend/client-facing responsibilities for this package or app.",
		source: [
			"Inspect local `src/app`, `src/components`, `src/client`, or exported type files before editing.",
			"Use the shared frontend and monorepo guides for cross-cutting rules.",
		],
		patterns: [
			"Follow local component/hook/provider organization before adding new folders.",
			"Use exported shared UI/types where available.",
			"Keep data fetching and cache readiness behavior consistent with existing app patterns.",
		],
		avoid: [
			"Do not introduce one-off component structures that conflict with `AGENTS.md`.",
			"Do not import server-only modules into client bundles.",
		],
		validate: ["Run the package/app typecheck script if present.", "Run targeted UI tests or app build for route/component changes."],
	},
};

const packageKeys = new Set(packages.map((pkg) => pkg.key));

function packageFromDir(dir) {
	const parts = dir.split("/");
	return { key: parts[2], layer: parts[3] };
}

const layerDirs = [];
function collectLayerDirs(base) {
	for (const packageName of readdirSync(base)) {
		const packageDir = join(base, packageName);
		try {
			for (const layer of readdirSync(packageDir)) {
				const layerDir = join(packageDir, layer);
				if (layer === "backend" || layer === "frontend") {
					layerDirs.push(layerDir);
				}
			}
		} catch {
			// skip non-directory entries
		}
	}
}
collectLayerDirs(specRoot);

for (const layerDir of layerDirs) {
	for (const name of readdirSync(layerDir)) {
		rmSync(join(layerDir, name), { recursive: true, force: true });
	}
}

for (const pkg of packages) {
	for (const [layer, guide] of Object.entries(pkg.layers)) {
		const dir = `.trellis/spec/${pkg.key}/${layer}`;
		write(`${dir}/index.md`, packageIndex({ title: pkg.title, layer, guide: JSON.stringify(guide) }));
		write(`${dir}/package-guidelines.md`, packageGuide({ title: pkg.title, layer, ...guide }));
	}
}

for (const layerDir of layerDirs) {
	const rel = layerDir.slice(root.length + 1);
	const { key, layer } = packageFromDir(rel);
	if (packageKeys.has(key)) continue;
	const title = key.includes("/") ? key : key;
	const guide = fallbackLayerGuides[layer];
	write(`${rel}/index.md`, packageIndex({ title, layer, guide: "" }));
	write(`${rel}/package-guidelines.md`, packageGuide({ title, layer, ...guide }));
}

const taskPath = ".trellis/tasks/00-bootstrap-guidelines/prd.md";
let prd = readFileSync(join(root, taskPath), "utf8");
prd = prd
	.replace(/- \[ \] Fill guidelines/g, "- [x] Fill guidelines")
	.replace(/- \[ \] Add code examples/g, "- [x] Add code examples");
write(taskPath, prd);
