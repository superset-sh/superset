# v1→v2 Import Duplicate-Projects Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the v1→v2 project importer detect already-imported projects (no more duplicates), make `importLocal` create idempotent, and give Import All the proven workspaces-page UX.

**Architecture:** Three layers per the spec (`plans/2026-08-10-v1-import-duplicate-projects-design.md`): (1) host-service `project.findByPath` short-circuits on a local-DB hit and drops the cloud staleness probe; (2) host-service `createFromImportLocal` reuses an existing row for the same resolved repo path and reports `created: false`; (3) the wizard lifts per-row import state to page level (mirroring `ImportWorkspacesPage`) and gates v1-appearance carry on `created`.

**Tech Stack:** Bun + bun:test, drizzle (better-sqlite3 in prod / bun:sqlite in tests), tRPC v11, React 19, Biome.

## Global Constraints

- Bun only — never npm/yarn/pnpm. Tests run with `bun test <path>`.
- `bun run lint` must exit 0 (Biome warnings fail CI). Run `bun run lint:fix` after edits.
- Never edit `packages/db/drizzle/` or `packages/host-service/drizzle/` (generated). No schema migrations in this work.
- Type safety: no `any` unless unavoidable; test-only context stubs may use a single `as unknown as HostServiceContext` cast (existing test idiom).
- Conventional-commit messages; PR title will be `fix(host-service,desktop): stop v1 importer from duplicating already-imported projects`.
- After changing host-service router types, regenerate dist-types with `bun run --cwd packages/host-service build:types` or desktop typecheck sees stale `AppRouter`.
- All paths below are repo-relative.

---

### Task 1: host-service — `findByPath` local-hit short-circuit

Remove the cloud staleness probe that drops local-first projects. A local-DB row keyed by the repo's resolved git root is returned immediately as the sole candidate — the cloud is never consulted (matches the non-`walkAllRemotes` branch and the repo's "local is reality" principle).

**Files:**
- Modify: `packages/host-service/src/trpc/router/project/project.ts` (the `findByPath` procedure, currently ~lines 334–556)
- Test (create): `packages/host-service/src/trpc/router/project/project-import.test.ts`

**Interfaces:**
- Consumes: existing `projectRouter`, `createCallerFactory` (from `../../index`), `createUserSimpleGit`, drizzle schema.
- Produces: `findByPath` response candidates no longer carry `staleLocalLink` (field deleted from the wire; verified unused repo-wide). Task 2 reuses this test file's harness helpers: `createTestDb(): HostDb`, `createTempGitRepo(): Promise<string>`, `createTestContext(db, api): HostServiceContext`, `createRecordingApiStub()`.

- [ ] **Step 1: Write the failing test**

Create `packages/host-service/src/trpc/router/project/project-import.test.ts`:

```ts
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { projects } from "../../../db/schema";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

export function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

/** Real git repo in a temp dir; returns the canonical git root (macOS
 * /var → /private/var symlinks resolved by rev-parse, which is exactly
 * what findByPath compares against). */
export async function createTempGitRepo(): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "v1-import-test-"));
	const git = createUserSimpleGit(dir);
	try {
		await git.init(["--initial-branch=main"]);
	} catch {
		await git.init();
	}
	await git.addConfig("user.email", "test@test.local");
	await git.addConfig("user.name", "Test");
	await git.raw(["commit", "--allow-empty", "-m", "init"]);
	return (await git.revparse(["--show-toplevel"])).trim();
}

export function createRecordingApiStub() {
	const calls: string[] = [];
	const api = {
		v2Project: {
			get: {
				query: async () => {
					calls.push("v2Project.get");
					const err = new Error("Project not found") as Error & {
						data?: { code?: string };
					};
					err.data = { code: "NOT_FOUND" };
					throw err;
				},
			},
			findByGitHubRemote: {
				query: async () => {
					calls.push("v2Project.findByGitHubRemote");
					return { candidates: [] };
				},
			},
		},
	};
	return { api, calls };
}

export function createTestContext(db: HostDb, api: unknown): HostServiceContext {
	// Absorbs any broadcast method emitProjectChanged / workspace stores call.
	const eventBus = new Proxy({}, { get: () => () => {} });
	return {
		db,
		api,
		eventBus,
		git: async (path: string) => createUserSimpleGit(path),
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext;
}

describe("findByPath walkAllRemotes (v1 importer)", () => {
	it("returns the local row as authoritative without consulting the cloud", async () => {
		const db = createTestDb();
		const { api, calls } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		// Local-first project: exists only in the host's local DB — the
		// cloud has never heard of it (this is the bug's exact setup).
		db.insert(projects)
			.values({
				id: randomUUID(),
				repoPath: root,
				name: "My Project",
				updatedAt: 1,
			})
			.run();

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]?.source).toBe("local-path");
		expect(result.candidates[0]?.name).toBe("My Project");
		expect(result.cloudErrors).toHaveLength(0);
		// The whole point: no staleness probe, no remote walk.
		expect(calls).toHaveLength(0);
	});

	it("still walks cloud remotes when no local row exists", async () => {
		const db = createTestDb();
		const { api, calls } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
			expectedRemoteUrl: "https://github.com/acme/demo",
		});

		expect(result.candidates).toHaveLength(0);
		expect(calls).toContain("v2Project.findByGitHubRemote");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/host-service/src/trpc/router/project/project-import.test.ts`
Expected: first test FAILS — `result.candidates` is `[]` (the staleness probe marked the row stale and filtered it) and/or `calls` contains `"v2Project.get"`. Second test should already pass.

- [ ] **Step 3: Implement the short-circuit**

In `packages/host-service/src/trpc/router/project/project.ts`, inside the `findByPath` `.query`:

3a. Move/merge the local-hit return so it applies to BOTH modes. Replace the block that currently reads (after `const localProject = ...`):

```ts
// Default behavior (folder-first import): purely local. A local-DB
// hit is the only candidate source — no hit means the caller
// creates a fresh local project; the cloud is never consulted.
if (!input.walkAllRemotes) {
	if (localProject) {
		return { candidates: [ ... ], cloudErrors: [...] };
	}
	return { candidates: [], cloudErrors: [] };
}
```

with a unified local-is-authoritative return (note `matches` is already defined above from `expectedParsed`; it returns `false` when `walkAllRemotes` is off because `expectedParsed` is `null`):

```ts
// A local-DB row keyed by this repo's git root is authoritative: the
// repo is already a v2 project on this device ("local is reality" —
// see the delete saga below). Return it without consulting the cloud.
// This covers both modes: the folder-first default has always worked
// this way, and the v1 importer must too — local-first projects have
// no cloud row, so any cloud probe here misreads them as stale and
// makes the importer create duplicates.
if (localProject) {
	return {
		candidates: [
			{
				id: localProject.id,
				name:
					localProject.name ||
					localProject.repoName ||
					basename(gitRoot),
				repoCloneUrl: localProject.repoUrl ?? null,
				source: "local-path" as const,
				matchesExpected: matches(localProject.repoUrl ?? null),
			},
		],
		cloudErrors: [] as { url: string; message: string }[],
	};
}

if (!input.walkAllRemotes) {
	return { candidates: [], cloudErrors: [] };
}
```

3b. In the remaining `walkAllRemotes` branch (now only reachable with NO local row), delete:
- the `Candidate` interface fields `cloudConfirmed` and `staleLocalLink` (and their doc comments);
- the `if (localProject) { byId.set(...) }` seeding block;
- in the cloud loop's merge branch, the lines that set `existing.cloudConfirmed = true` and the `cloudConfirmed: true` / `staleLocalLink: false` literals (keep the `matchesExpected` / `repoCloneUrl` merge for the same id arriving via two URLs);
- the entire post-loop staleness block (`// Detect stale local-DB row: ... if (localProject) { ... }` through its closing brace);
- in the final `candidates` construction: the `.filter((c) => !c.staleLocalLink)` and the `.map(({ cloudConfirmed: _omit, ...rest }) => rest)` strip (keep the sort). Update the comment above it to drop the "Strip the internal cloudConfirmed flag" sentence.

Also update the `walkAllRemotes` input doc comment: remove the "and surface stale local-DB rows" claim, and state that a local-DB hit short-circuits in both modes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/host-service/src/trpc/router/project/project-import.test.ts`
Expected: both PASS.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint:fix
git add packages/host-service/src/trpc/router/project/project.ts packages/host-service/src/trpc/router/project/project-import.test.ts
git commit -m "fix(host-service): treat local project rows as authoritative in findByPath"
```

---

### Task 2: host-service — idempotent `createFromImportLocal` + `created` marker

**Files:**
- Modify: `packages/host-service/src/trpc/router/project/handlers.ts` (`CreateResult`, `persistFromResolved`, `createFromImportLocal`)
- Test (extend): `packages/host-service/src/trpc/router/project/project-import.test.ts`

**Interfaces:**
- Consumes: Task 1's test harness helpers (`createTestDb`, `createTempGitRepo`, `createTestContext`, `createRecordingApiStub`); existing `ensureMainWorkspaceStrict(ctx, projectId, repoPath): Promise<{ id: string }>` (idempotent — returns the existing `type='main'` workspace row when present).
- Produces: `CreateResult` gains `created: boolean` (`true` = new row, `false` = reused). All create modes return it (`empty`/`template`/`clone` always `true`). Task 3 depends on this field reaching the renderer through `AppRouter` dist-types.

- [ ] **Step 1: Write the failing test**

Append to `project-import.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { createFromImportLocal } from "./handlers";

describe("createFromImportLocal idempotency", () => {
	it("reuses the existing project for the same repo path and preserves identity", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		const first = await createFromImportLocal(ctx, {
			name: "Imported",
			repoPath: root,
		});
		expect(first.created).toBe(true);
		expect(first.mainWorkspaceId).toBeTruthy();

		// User customizes the project in v2 — a re-import must not undo this.
		db.update(projects)
			.set({ name: "Custom Name", color: "#112233", icon: "none" })
			.where(eq(projects.id, first.projectId))
			.run();

		const second = await createFromImportLocal(ctx, {
			name: "Imported (again)",
			repoPath: root,
		});

		expect(second.projectId).toBe(first.projectId);
		expect(second.created).toBe(false);
		expect(second.mainWorkspaceId).toBe(first.mainWorkspaceId);

		const rows = db.select().from(projects).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe("Custom Name");
		expect(rows[0]?.color).toBe("#112233");
		expect(rows[0]?.icon).toBe("none");
	});
});
```

(Add `eq` and `createFromImportLocal` to the existing import lists rather than duplicating import statements if the file already imports from those modules.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/host-service/src/trpc/router/project/project-import.test.ts`
Expected: FAIL — today the second call inserts a second row (`rows` has length 2, differing `projectId`s), and `created` does not exist on `CreateResult` (type error is also acceptable as the failure mode).

- [ ] **Step 3: Implement**

In `packages/host-service/src/trpc/router/project/handlers.ts`:

3a. Extend the result type:

```ts
export interface CreateResult {
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string;
	/** False when an existing local project row for the same repo path was
	 * reused instead of inserting a new one (importLocal only). Callers use
	 * this to skip side effects that would clobber user customizations. */
	created: boolean;
}
```

3b. In `persistFromResolved`'s success return, add `created: true`.

3c. Rewrite `createFromImportLocal`:

```ts
export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: { name: string; repoPath: string; initIfNeeded?: boolean },
): Promise<CreateResult> {
	const resolved = await resolveOrInitLocalRepo(
		args.repoPath,
		args.initIfNeeded ?? false,
	);

	// Idempotency guard: importing a repo that is already a project on this
	// device returns the existing project instead of minting a duplicate
	// row. Deliberately leaves the row untouched (no rename, no repo-field
	// refresh) — the user may have customized it in v2.
	const existing = ctx.db.query.projects
		.findFirst({ where: eq(projects.repoPath, resolved.repoPath) })
		.sync();
	if (existing) {
		const mainWorkspace = await ensureMainWorkspaceStrict(
			ctx,
			existing.id,
			resolved.repoPath,
		);
		return {
			projectId: existing.id,
			repoPath: resolved.repoPath,
			mainWorkspaceId: mainWorkspace.id,
			created: false,
		};
	}

	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		// User pointed us at an existing folder; never rm it.
		cleanupRepoPathOnFailure: false,
	});
}
```

(`eq`, `projects`, and `ensureMainWorkspaceStrict` are already imported in this file.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/host-service/src/trpc/router/project/project-import.test.ts`
Expected: all PASS.

- [ ] **Step 5: Regenerate dist-types, lint, commit**

```bash
bun run --cwd packages/host-service build:types
bun run lint:fix
git add packages/host-service/src/trpc/router/project/handlers.ts packages/host-service/src/trpc/router/project/project-import.test.ts
git commit -m "fix(host-service): make importLocal project create idempotent on repo path"
```

(If `dist-types` output is gitignored, nothing extra to stage; if tracked, include it in the commit.)

---

### Task 3: renderer — gate v1-appearance carry on `created`

**Files:**
- Modify: `apps/desktop/src/renderer/lib/v1-migration/projects.ts` (the `importV1Project` create path, currently ~lines 152–163)
- Test (extend): `apps/desktop/src/renderer/lib/v1-migration/v1-migration.test.ts`

**Interfaces:**
- Consumes: `CreateResult.created: boolean` from Task 2 (via `HostServiceClient` / `AppRouter` dist-types); existing `importV1Project` and `carryV1ProjectAppearance` (private helper — asserted indirectly via `setColor` calls).
- Produces: no signature changes; behavior only.

- [ ] **Step 1: Write the failing test**

Append to `v1-migration.test.ts` (follow the file's existing import style; `HostServiceClient` type comes from `renderer/lib/host-service-client`):

```ts
describe("importV1Project appearance carry", () => {
	const v1Project = {
		id: "v1-1",
		name: "proj",
		mainRepoPath: "/tmp/proj",
		githubOwner: null,
		color: "#112233",
		hideImage: false,
	};

	function fakeHostClient(created: boolean | undefined) {
		const setColorCalls: unknown[] = [];
		const client = {
			project: {
				create: {
					mutate: async () => ({
						projectId: "p-new",
						mainWorkspaceId: "w-1",
						repoPath: "/tmp/proj",
						created,
					}),
				},
				setColor: {
					mutate: async (input: unknown) => {
						setColorCalls.push(input);
					},
				},
				setIcon: { mutate: async () => {} },
				setup: {
					mutate: async () => {
						throw new Error("setup should not be called");
					},
				},
			},
		} as unknown as HostServiceClient;
		return { client, setColorCalls };
	}

	const emptyFindByPath = {
		candidates: [],
		cloudErrors: [],
	} as unknown as ProjectFindByPathResult;

	it("skips appearance carry when the host reused an existing project", async () => {
		const { client, setColorCalls } = fakeHostClient(false);
		const result = await importV1Project({
			hostClient: client,
			project: v1Project,
			findByPathResult: emptyFindByPath,
		});
		expect(result.kind).toBe("imported");
		expect(setColorCalls).toHaveLength(0);
	});

	it("carries appearance for newly created projects", async () => {
		const { client, setColorCalls } = fakeHostClient(true);
		await importV1Project({
			hostClient: client,
			project: v1Project,
			findByPathResult: emptyFindByPath,
		});
		expect(setColorCalls).toHaveLength(1);
	});

	it("carries appearance when an older host omits the created field", async () => {
		const { client, setColorCalls } = fakeHostClient(undefined);
		await importV1Project({
			hostClient: client,
			project: v1Project,
			findByPathResult: emptyFindByPath,
		});
		expect(setColorCalls).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/desktop/src/renderer/lib/v1-migration/v1-migration.test.ts`
Expected: "skips appearance carry" FAILS (`setColorCalls` has length 1 — carry is unconditional today). The other two pass.

- [ ] **Step 3: Implement**

In `apps/desktop/src/renderer/lib/v1-migration/projects.ts`, replace the create-path tail:

```ts
	const result = await hostClient.project.create.mutate({
		name: project.name,
		mode: { kind: "importLocal", repoPath: project.mainRepoPath },
	});
	// Only stamp v1 appearance onto projects this call actually created.
	// A reused project (created === false) may carry v2 customizations the
	// user chose after their first import — never overwrite those. Older
	// hosts omit the field; keep their long-standing carry behavior.
	if (result.created !== false) {
		await carryV1ProjectAppearance(hostClient, result.projectId, project);
	}
	return {
		kind: "imported",
		v2ProjectId: result.projectId,
		mainWorkspaceId: result.mainWorkspaceId,
		repoPath: result.repoPath,
	};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/desktop/src/renderer/lib/v1-migration/v1-migration.test.ts`
Expected: all PASS.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint:fix
git add apps/desktop/src/renderer/lib/v1-migration/projects.ts apps/desktop/src/renderer/lib/v1-migration/v1-migration.test.ts
git commit -m "fix(desktop): don't restamp v1 appearance on reused v2 projects during import"
```

---

### Task 4: renderer — lift ImportProjectsPage state, workspaces-style Import All

Mirror `ImportWorkspacesPage`: one page-level status map drives both single-row imports and Import All; the header button shows `Import all · N`, `Importing i/n` while running, and disappears when nothing is pending. Failed rows show inline errors with Retry and stay pending.

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportProjectsPage/ImportProjectsPage.tsx`
- Test (create): `apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportProjectsPage/ImportProjectsPage.test.ts`

**Interfaces:**
- Consumes: `decideProjectImport(result): ProjectImportDecision` (`{kind:"already-imported"|...}` / `{kind:"import"}` / `{kind:"skip"; reason}`), `RowAction` from `../components/ImportRow`, Task 3's `importV1Project` behavior.
- Produces: exported pure helper `selectPendingProjects` (tested), exported type `ProjectImportStatus`. No external component API changes — `V1ImportModal` renders the page identically.

- [ ] **Step 1: Write the failing test for the pending-selection helper**

Create `ImportProjectsPage.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { ProjectImportDecision } from "renderer/lib/v1-migration";
import { selectPendingProjects } from "./ImportProjectsPage";

const p = (id: string) => ({ id });

describe("selectPendingProjects", () => {
	const importDecision: ProjectImportDecision = { kind: "import" };
	const alreadyImported: ProjectImportDecision = {
		kind: "already-imported",
		v2ProjectId: "v2-1",
	};
	const skip: ProjectImportDecision = {
		kind: "skip",
		reason: "multiple-candidates",
	};

	it("keeps importable, undecided, and errored projects; drops imported/running/skip", () => {
		const projects = [p("a"), p("b"), p("c"), p("d"), p("e"), p("f")];
		const decisions = new Map<string, ProjectImportDecision | undefined>([
			["a", importDecision], // pending
			["b", alreadyImported], // dropped: server says imported
			["c", skip], // dropped: needs a human (pick / cloud-unreachable)
			["d", importDecision], // dropped: running
			["e", importDecision], // dropped: imported this session
			// "f" has no decision yet (query loading) — stays pending
		]);
		const states = new Map([
			["d", { kind: "running" as const }],
			["e", { kind: "imported" as const }],
		]);

		expect(
			selectPendingProjects(projects, decisions, states).map((x) => x.id),
		).toEqual(["a", "f"]);
	});

	it("keeps errored projects pending so Import All retries them", () => {
		const projects = [p("a")];
		const decisions = new Map([["a", importDecision]]);
		const states = new Map([
			["a", { kind: "error" as const, message: "boom" }],
		]);
		expect(
			selectPendingProjects(projects, decisions, states),
		).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportProjectsPage/ImportProjectsPage.test.ts`
Expected: FAIL — `selectPendingProjects` is not exported.

- [ ] **Step 3: Implement the page changes**

In `ImportProjectsPage.tsx`:

3a. Add the shared status type and pure helper (exported, near the top, after the `V1Project` type):

```ts
export type ProjectImportStatus =
	| { kind: "idle" }
	| { kind: "running" }
	| { kind: "imported"; v2ProjectId: string }
	| { kind: "error"; message: string };

const IDLE: ProjectImportStatus = { kind: "idle" };

/**
 * Which projects Import All would act on, and what the button's `· N`
 * counts. Pending = importable now (or still loading its findByPath
 * probe) and not already imported/running. Errors stay pending so a
 * re-press retries them; skip decisions (multiple candidates, cloud
 * unreachable) need a human and are excluded.
 */
export function selectPendingProjects<T extends { id: string }>(
	projects: readonly T[],
	decisions: ReadonlyMap<string, ProjectImportDecision | undefined>,
	states: ReadonlyMap<string, { kind: string }>,
): T[] {
	return projects.filter((project) => {
		const state = states.get(project.id)?.kind ?? "idle";
		if (state === "running" || state === "imported") return false;
		const decision = decisions.get(project.id);
		if (decision && decision.kind !== "import") return false;
		return true;
	});
}
```

Add `ProjectImportDecision` to the existing `renderer/lib/v1-migration` import.

3b. In `ImportProjectsPage`, add page-level state + page-level findByPath queries (the same query keys the rows use, so the cache is shared):

```ts
const [importStates, setImportStates] = useState<
	Map<string, ProjectImportStatus>
>(() => new Map());
const importStatesRef = useRef(importStates);
importStatesRef.current = importStates;

const updateImportStatus = useCallback(
	(v1ProjectId: string, status: ProjectImportStatus) => {
		setImportStates((prev) => {
			const next = new Map(prev);
			if (status.kind === "idle") next.delete(v1ProjectId);
			else next.set(v1ProjectId, status);
			return next;
		});
	},
	[],
);

const findByPathQueries = useQueries({
	queries: projects.map((project) => ({
		queryKey: projectFindByPathQueryKey(project, activeHostUrl),
		queryFn: projectFindByPathQueryFn(project, activeHostUrl),
		retry: false as const,
	})),
});

const decisions = useMemo(() => {
	const map = new Map<string, ProjectImportDecision | undefined>();
	projects.forEach((project, index) => {
		const data = findByPathQueries[index]?.data;
		map.set(project.id, data ? decideProjectImport(data) : undefined);
	});
	return map;
}, [projects, findByPathQueries]);

const pendingProjects = selectPendingProjects(
	projects,
	decisions,
	importStates,
);
```

(Imports to add: `useMemo`, `useRef`, `useCallback` from react; `useQueries` from `@tanstack/react-query`.)

3c. Rewrite `importAll` to drive the shared map and skip non-pending rows (replace the existing function body; keep `fetchProjectFindByPath` and the module-level `importProject` helper as-is):

```ts
const importAll = async () => {
	if (isImportingAll) return;
	const queue = selectPendingProjects(
		projects,
		decisions,
		importStatesRef.current,
	);
	if (queue.length === 0) return;
	setImportAllProgress({ current: 0, total: queue.length });
	try {
		for (let i = 0; i < queue.length; i++) {
			const project = queue[i];
			if (!project) continue;
			const current = importStatesRef.current.get(project.id) ?? IDLE;
			if (current.kind === "running" || current.kind === "imported") {
				continue;
			}
			setImportAllProgress({ current: i, total: queue.length });
			updateImportStatus(project.id, { kind: "running" });
			try {
				const findByPathResult = await fetchProjectFindByPath(
					queryClient,
					project,
					activeHostUrl,
				);
				const decision = decideProjectImport(findByPathResult);
				if (decision.kind === "already-imported") {
					updateImportStatus(project.id, {
						kind: "imported",
						v2ProjectId: decision.v2ProjectId,
					});
					continue;
				}
				if (decision.kind !== "import") {
					// Needs a human (pick / cloud unreachable) — leave idle;
					// the row renders its own pick/error affordance.
					updateImportStatus(project.id, IDLE);
					continue;
				}
				const result = await importProject({
					project,
					organizationId,
					activeHostUrl,
					findByPathResult,
					finalizeSetup,
				});
				if (result.kind === "imported") {
					updateImportStatus(project.id, {
						kind: "imported",
						v2ProjectId: result.v2ProjectId,
					});
					await invalidateProjectImportQueries(queryClient, project);
				} else {
					// needs-relocate requires the row's confirm flow.
					updateImportStatus(project.id, IDLE);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				updateImportStatus(project.id, { kind: "error", message });
				console.error("[v1-import] project import all failed", {
					v1ProjectId: project.id,
					mainRepoPath: project.mainRepoPath,
					organizationId,
					err,
				});
			}
		}
	} finally {
		setImportAllProgress(null);
	}
};
```

3d. Replace the header button with workspaces-page semantics:

```tsx
const showImportAll = pendingProjects.length > 0 || isImportingAll;

const headerAction = showImportAll ? (
	<Button
		type="button"
		size="sm"
		variant="default"
		onClick={() => {
			void importAll();
		}}
		disabled={isImportingAll || isLoading || pendingProjects.length === 0}
		className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium tabular-nums"
	>
		{importAllProgress && <Spinner className="size-3" />}
		{importAllProgress
			? `Importing ${importAllProgress.current + 1}/${importAllProgress.total}`
			: `Import all · ${pendingProjects.length}`}
	</Button>
) : null;
```

3e. Wire rows to the shared map. Pass status + updater:

```tsx
{projects.map((project) => (
	<ProjectRow
		key={project.id}
		project={project}
		organizationId={organizationId}
		activeHostUrl={activeHostUrl}
		status={importStates.get(project.id) ?? IDLE}
		onStatusChange={(status) => updateImportStatus(project.id, status)}
	/>
))}
```

3f. Update `ProjectRow` to render from and report into the shared map. Change its props:

```ts
interface ProjectRowProps {
	project: V1Project;
	organizationId: string;
	activeHostUrl: string;
	status: ProjectImportStatus;
	onStatusChange: (status: ProjectImportStatus) => void;
}
```

Delete the row-local `running`, `errorMessage`, and `linkedV2Id` states (keep `pendingRelocate` — it is an interactive per-row confirm). Rewrite `runImport` to report through `onStatusChange`:

```ts
const runImport = async (
	linkToProjectId?: string,
	options: { allowRelocate?: boolean } = {},
) => {
	onStatusChange({ kind: "running" });
	setPendingRelocate(null);
	try {
		const result = await importProject({
			project,
			organizationId,
			activeHostUrl,
			findByPathResult: findByPathQuery.data,
			finalizeSetup,
			linkToProjectId,
			allowRelocate: options.allowRelocate ?? false,
		});

		if (result.kind === "needs-relocate") {
			setPendingRelocate({
				v2ProjectId: result.v2ProjectId,
				message: result.message,
			});
			onStatusChange({ kind: "idle" });
			return;
		}

		onStatusChange({ kind: "imported", v2ProjectId: result.v2ProjectId });
		await invalidateProjectImportQueries(queryClient, project);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		onStatusChange({ kind: "error", message });
		console.error("[v1-import] project import failed", {
			v1ProjectId: project.id,
			mainRepoPath: project.mainRepoPath,
			organizationId,
			err,
		});
	}
};
```

And in the row's `action` derivation, replace the old state reads:

```ts
const isImported =
	isProjectAlreadyImported(findByPathQuery.data) ||
	status.kind === "imported";

const action: RowAction = (() => {
	if (status.kind === "running") return { kind: "running" };
	if (pendingRelocate) {
		/* ...unchanged confirm block... */
	}
	if (isImported) {
		return { kind: "imported", label: "Linked" };
	}
	if (status.kind === "error") {
		return {
			kind: "error",
			message: status.message,
			onRetry: () => runImport(),
		};
	}
	/* ...rest unchanged: findByPathQuery pending/error, cloudErrors,
	   pick, ready... */
})();
```

- [ ] **Step 4: Run the tests + typecheck**

Run: `bun test apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportProjectsPage/ImportProjectsPage.test.ts`
Expected: PASS.
Run: `bun run typecheck`
Expected: exit 0 (requires Task 2's `build:types` to have run).

- [ ] **Step 5: Lint + commit**

```bash
bun run lint:fix
git add apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportProjectsPage/
git commit -m "feat(desktop): workspaces-style Import All state and pending count in v1 project importer"
```

---

### Task 5: Full verification — suite, then end-to-end evidence

**Files:** none new (evidence goes in the PR description; screenshots to scratchpad).

**Interfaces:** consumes the running local dev stack from the debugging session (workspace host DB at `superset-dev-data/host/7c6e9b3b*/host.db`, currently 4 duplicate rows per repo path — the preserved "before" state).

- [ ] **Step 1: Run the full local gate**

```bash
bun run lint
bun run typecheck
bun test packages/host-service/src/trpc/router/project/ apps/desktop/src/renderer/lib/v1-migration/ apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/
```
Expected: all exit 0. Fix anything that fails before proceeding.

- [ ] **Step 2: Restart the dev stack** so the desktop + host-service pick up the changes (kill the running `bun dev`, relaunch with `RENDERER_REMOTE_DEBUG_PORT=9223 bun dev`).

- [ ] **Step 3: E2E — already-imported detection (the reported bug)**

In the dev app (Local Admin, backdated account): Settings → Experimental → Open importer → "Bring over your projects".
Expected after fix: every row shows the green **Linked** state (server-side truth — the host DB has rows for all 5 repos); the **Import all** button is **hidden** (nothing pending). Close and reopen the importer — same state. Watch the host-DB row monitor: **no new rows**.

- [ ] **Step 4: E2E — fresh import path**

Delete one project's rows from the dev host DB to simulate a not-yet-imported project (dev data only):

```bash
sqlite3 superset-dev-data/host/7c6e9b3b*/host.db \
  "delete from projects where repo_path='/Users/manu/.superset/projects/recut';"
```

Refresh the importer (circular-arrows button). Expected: `recut` shows **Import**, button reads **Import all · 1**. Press it. Expected: `Importing 1/1` → row flips to **Linked**, button disappears, exactly **one** new row appears in the DB monitor, and re-opening the importer still shows Linked. Press nothing else — re-verify the button stays hidden.

- [ ] **Step 5: Capture evidence + wrap up**

Screenshot the importer (all Linked, no button) and the fresh-import before/after; save to scratchpad for the PR description. Query final row counts:

```bash
for db in superset-dev-data/host/*/host.db; do sqlite3 "file:$db?mode=ro" \
  "select repo_path, count(*) from projects group by repo_path;"; done
```
Expected: exactly one more `recut` row than before Step 4's delete+import (i.e. back to its pre-delete count minus the deleted duplicates plus one) and unchanged counts everywhere else. Mark the spec's "After the fix" checklist satisfied, then commit any final tweaks:

```bash
git add -A && git commit -m "docs(plans): record after-fix verification for v1 import duplicate fix"
```

---

## Self-Review Notes

- Spec coverage: Part 1 → Task 1; Part 2 (+created marker/appearance) → Tasks 2–3; Part 3 (state lift, `Import all · N`, error semantics) → Task 4; Testing/evidence gate → Tasks 1–5. Out-of-scope items (dedupe sweep, unique index, workspaces/presets pages) untouched.
- `matchesExpected` on the unified local-hit return preserves the walkAllRemotes sort contract without cloud calls; it is `false` for the default branch exactly as today.
- Type consistency: `created: boolean` (Task 2) is read as `result.created !== false` (Task 3) to tolerate older hosts; `ProjectImportStatus`/`selectPendingProjects` names match between Task 4's test and implementation.
