import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { initTRPC } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import * as localDbRelations from "../../../../../../../packages/local-db/src/schema/relations";
import * as localDbSchema from "../../../../../../../packages/local-db/src/schema/schema";
import * as localDbZod from "../../../../../../../packages/local-db/src/schema/zod";

/**
 * Human-ish SQL fragment from a Drizzle `SQL` tree (StringChunk text + column
 * names). Used by the in-memory fake to branch on `isNotNull` / `isNull` / etc.
 */
function describeSqlCond(cond: unknown): string {
	const parts: string[] = [];
	const visit = (n: unknown) => {
		if (n == null) return;
		const o = n as {
			constructor?: { name?: string };
			value?: unknown[];
			queryChunks?: unknown[];
			name?: string;
		};
		if (o.constructor?.name === "StringChunk" && Array.isArray(o.value)) {
			parts.push(String(o.value.join("")));
			return;
		}
		if (typeof o.name === "string" && o.name) {
			parts.push(o.name);
			return;
		}
		if (Array.isArray(o.queryChunks)) {
			for (const c of o.queryChunks) visit(c);
		}
	};
	visit(cond);
	return parts.join(" ");
}

function workspaceWhereExcludesDeleting(cond: unknown): boolean {
	const d = describeSqlCond(cond);
	return d.includes("deleting_at") && d.includes("is null");
}

function condIsArchivedAtNotNull(cond: unknown): boolean {
	const d = describeSqlCond(cond);
	return d.includes("archived_at") && d.includes("is not null");
}

function condIsTabOrderNotNull(cond: unknown): boolean {
	const d = describeSqlCond(cond);
	return d.includes("tab_order") && d.includes("is not null");
}

const { projects, settings, workspaces } = localDbSchema;

mock.module("@superset/local-db", () => ({
	...localDbSchema,
	...localDbZod,
	...localDbRelations,
}));
mock.module("@superset/local-db/schema", () => ({
	...localDbSchema,
	...localDbZod,
	...localDbRelations,
}));

const killByWorkspaceIdMock = mock(async () => ({ failed: 0 }));

mock.module("main/lib/workspace-runtime", () => ({
	getWorkspaceRuntimeRegistry: () => ({
		getForWorkspaceId: (_workspaceId: string) => ({
			terminal: { killByWorkspaceId: killByWorkspaceIdMock },
		}),
	}),
}));

const trackMock = mock(() => {});

mock.module("main/lib/analytics", () => ({
	track: trackMock,
	clearUserCache: mock(() => {}),
	shutdown: mock(() => Promise.resolve()),
}));

type ProjectRow = typeof projects.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type SettingsRow = typeof settings.$inferSelect;

/** Collect Param values from a Drizzle SQL condition (depth-first). */
function collectParamValues(cond: unknown): unknown[] {
	const out: unknown[] = [];
	const visit = (node: unknown) => {
		if (node == null) return;
		const n = node as {
			constructor?: { name?: string };
			value?: unknown;
			queryChunks?: unknown[];
		};
		if (n.constructor?.name === "Param" && "value" in n) {
			out.push(n.value);
			return;
		}
		if (Array.isArray(n.queryChunks)) {
			for (const ch of n.queryChunks) visit(ch);
		}
	};
	visit(cond);
	return out;
}

function createFakeLocalDb() {
	const projectById = new Map<string, ProjectRow>();
	const workspaceList: WorkspaceRow[] = [];
	let settingsRow = {
		id: 1,
		lastActiveWorkspaceId: null,
		terminalPresets: null,
		terminalPresetsInitialized: null,
		agentPresetOverrides: null,
		agentCustomDefinitions: null,
		agentPresetPermissionsMigratedAt: null,
		selectedRingtoneId: null,
		activeOrganizationId: null,
		confirmOnQuit: null,
		terminalLinkBehavior: null,
	} as SettingsRow;

	function cloneProject(p: ProjectRow): ProjectRow {
		return { ...p };
	}

	function cloneWorkspace(w: WorkspaceRow): WorkspaceRow {
		return { ...w };
	}

	const localDb = {
		insert(table: unknown) {
			return {
				values: (row: ProjectRow | WorkspaceRow | SettingsRow) => {
					const baseRun = () => {
						if (table === projects) {
							const p = row as ProjectRow;
							projectById.set(p.id, cloneProject(p));
						} else if (table === workspaces) {
							workspaceList.push(cloneWorkspace(row as WorkspaceRow));
						} else if (table === settings) {
							settingsRow = {
								...settingsRow,
								...(row as SettingsRow),
							} as SettingsRow;
						}
					};
					return {
						run: baseRun,
						onConflictDoUpdate(opts: { set: Partial<SettingsRow> }) {
							return {
								run: () => {
									if (table === settings) {
										settingsRow = {
											...settingsRow,
											...(row as SettingsRow),
											...opts.set,
										} as SettingsRow;
									} else {
										baseRun();
									}
								},
							};
						},
					};
				},
			};
		},

		select(_fields?: Record<string, unknown>) {
			const isPartialSelect =
				_fields != null &&
				typeof _fields === "object" &&
				!Array.isArray(_fields);
			return {
				from(table: unknown) {
					if (isPartialSelect && table === workspaces) {
						return {
							innerJoin(_other: unknown, _on: unknown) {
								return {
									where(_cond: unknown) {
										return {
											orderBy(..._args: unknown[]) {
												return {
													all: (): { id: string; lastOpenedAt: number }[] => {
														const rows: {
															id: string;
															lastOpenedAt: number;
														}[] = [];
														for (const w of workspaceList) {
															if (w.deletingAt != null) continue;
															const p = projectById.get(w.projectId);
															if (!p || p.tabOrder == null) continue;
															rows.push({
																id: w.id,
																lastOpenedAt: w.lastOpenedAt,
															});
														}
														rows.sort(
															(a, b) => b.lastOpenedAt - a.lastOpenedAt,
														);
														return rows;
													},
												};
											},
										};
									},
								};
							},
						};
					}
					return {
						where(cond: unknown) {
							return {
								get: ():
									| ProjectRow
									| WorkspaceRow
									| SettingsRow
									| undefined => {
									if (table === settings) {
										return { ...settingsRow };
									}
									if (table === projects) {
										const params = collectParamValues(cond);
										for (const p of projectById.values()) {
											if (params.includes(p.id)) return cloneProject(p);
										}
										if (condIsArchivedAtNotNull(cond)) {
											for (const p of projectById.values()) {
												if (p.archivedAt != null) return cloneProject(p);
											}
										}
										return undefined;
									}
									return undefined;
								},
								all: (): ProjectRow[] | WorkspaceRow[] => {
									if (table === projects) {
										if (condIsTabOrderNotNull(cond)) {
											return [...projectById.values()]
												.filter((p) => p.tabOrder != null)
												.map(cloneProject);
										}
									}
									if (table === workspaces) {
										const params = collectParamValues(cond);
										const projectIdFilter = params.find(
											(v) =>
												typeof v === "string" && projectById.has(v as string),
										) as string | undefined;
										if (projectIdFilter) {
											let list = workspaceList.filter(
												(w) => w.projectId === projectIdFilter,
											);
											if (workspaceWhereExcludesDeleting(cond)) {
												list = list.filter((w) => w.deletingAt == null);
											}
											return list.map(cloneWorkspace);
										}
										if (cond && collectParamValues(cond).length >= 1) {
											const pid = String(params[0]);
											let list = workspaceList.filter(
												(w) => w.projectId === pid,
											);
											if (workspaceWhereExcludesDeleting(cond)) {
												list = list.filter((w) => w.deletingAt == null);
											}
											return list.map(cloneWorkspace);
										}
									}
									return [];
								},
								orderBy(..._args: unknown[]) {
									return {
										all: (): ProjectRow[] => {
											let rows = [...projectById.values()];
											if (condIsArchivedAtNotNull(cond)) {
												rows = rows.filter((p) => p.archivedAt != null);
												rows.sort(
													(a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0),
												);
												return rows.map(cloneProject);
											}
											if (condIsTabOrderNotNull(cond)) {
												rows = rows.filter((p) => p.tabOrder != null);
												rows.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
												return rows.map(cloneProject);
											}
											rows.sort(
												(a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0),
											);
											return rows.map(cloneProject);
										},
									};
								},
							};
						},
						get(): SettingsRow | undefined {
							if (table === settings) return { ...settingsRow };
							return undefined;
						},
					};
				},
			};
		},

		update(table: unknown) {
			return {
				set(patch: Partial<ProjectRow> | Partial<SettingsRow>) {
					return {
						where(cond: unknown) {
							return {
								run: () => {
									if (table === projects) {
										const params = collectParamValues(cond);
										for (const [id, p] of projectById) {
											if (params.includes(id)) {
												projectById.set(id, {
													...p,
													...(patch as Partial<ProjectRow>),
												} as ProjectRow);
											}
										}
									} else if (table === settings) {
										settingsRow = {
											...settingsRow,
											...(patch as Partial<SettingsRow>),
										} as SettingsRow;
									}
								},
							};
						},
					};
				},
			};
		},
	};

	return {
		localDb,
		projectById,
		workspaceList,
		get settings() {
			return settingsRow;
		},
	};
}

const dbHolder: {
	current: ReturnType<typeof createFakeLocalDb> | null;
} = { current: null };

const localDbFacade = new Proxy(
	{} as ReturnType<typeof createFakeLocalDb>["localDb"],
	{
		get(_target, prop, _receiver) {
			const h = dbHolder.current;
			if (!h) throw new Error("[project-archive.test] db not initialized");
			const v = Reflect.get(h.localDb, prop, h.localDb);
			return typeof v === "function" ? v.bind(h.localDb) : v;
		},
	},
);

mock.module("main/lib/local-db", () => ({
	localDb: localDbFacade,
}));

const testT = initTRPC.create({ transformer: superjson, isServer: true });

const { createProjectsRouter } = await import("./projects");

const createCaller = testT.createCallerFactory(
	createProjectsRouter(() => null),
);

const caller = createCaller({});

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_ACTIVE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WS_DELETING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_PROJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_WS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const now = () => Date.now();

function getFakeDb(): ReturnType<typeof createFakeLocalDb> {
	const h = dbHolder.current;
	if (!h) throw new Error("[project-archive.test] db not initialized");
	return h;
}

/** Typed escape hatch: the in-memory fake matches Drizzle call shapes but is not a full `LocalDb` type. */
function getProjectRowById(
	h: ReturnType<typeof createFakeLocalDb>,
	id: string,
): ProjectRow | undefined {
	type SelectProject = {
		select(): {
			from(table: unknown): {
				where(cond: unknown): { get(): ProjectRow | undefined };
			};
		};
	};
	return (h.localDb as SelectProject)
		.select()
		.from(projects)
		.where(eq(projects.id, id))
		.get();
}

function seedActiveProject(h: ReturnType<typeof createFakeLocalDb>) {
	const t = now();
	h.localDb
		.insert(projects)
		.values({
			id: PROJECT_ID,
			mainRepoPath: "/tmp/archive-test-repo",
			name: "Archive Test",
			color: "#336699",
			tabOrder: 0,
			lastOpenedAt: t,
			createdAt: t,
			archivedAt: null,
			defaultBranch: null,
			configToastDismissed: null,
			workspaceBaseBranch: null,
			githubOwner: null,
			branchPrefixMode: null,
			branchPrefixCustom: null,
			worktreeBaseDir: null,
			hideImage: null,
			iconUrl: null,
			neonProjectId: null,
			defaultApp: null,
		} as ProjectRow)
		.run();

	h.localDb
		.insert(settings)
		.values({
			id: 1,
			lastActiveWorkspaceId: null,
		} as SettingsRow)
		.run();

	h.localDb
		.insert(workspaces)
		.values({
			id: WS_ACTIVE,
			projectId: PROJECT_ID,
			worktreeId: null,
			type: "branch",
			branch: "main",
			name: "default",
			tabOrder: 0,
			createdAt: t,
			updatedAt: t,
			lastOpenedAt: t,
			isUnread: false,
			isUnnamed: false,
			deletingAt: null,
			sectionId: null,
			portBase: null,
		} as WorkspaceRow)
		.run();

	h.localDb
		.insert(workspaces)
		.values({
			id: WS_DELETING,
			projectId: PROJECT_ID,
			worktreeId: null,
			type: "branch",
			branch: "side",
			name: "side",
			tabOrder: 1,
			createdAt: t,
			updatedAt: t,
			lastOpenedAt: t,
			isUnread: false,
			isUnnamed: false,
			deletingAt: t,
			sectionId: null,
			portBase: null,
		} as WorkspaceRow)
		.run();
}

describe("projects archive / unarchive / getArchived", () => {
	beforeEach(() => {
		killByWorkspaceIdMock.mockReset();
		killByWorkspaceIdMock.mockResolvedValue({ failed: 0 });
		trackMock.mockReset();
		dbHolder.current = createFakeLocalDb();
	});

	afterAll(() => {
		dbHolder.current = null;
	});

	it("getArchived returns [] when nothing is archived", async () => {
		const h = getFakeDb();
		const t = now();
		h.localDb
			.insert(projects)
			.values({
				id: PROJECT_ID,
				mainRepoPath: "/tmp/r",
				name: "P",
				color: "#000",
				tabOrder: 0,
				lastOpenedAt: t,
				createdAt: t,
				archivedAt: null,
				defaultBranch: null,
				configToastDismissed: null,
				workspaceBaseBranch: null,
				githubOwner: null,
				branchPrefixMode: null,
				branchPrefixCustom: null,
				worktreeBaseDir: null,
				hideImage: null,
				iconUrl: null,
				neonProjectId: null,
				defaultApp: null,
			} as ProjectRow)
			.run();

		await expect(caller.getArchived()).resolves.toEqual([]);
	});

	it("archive sets archivedAt and tabOrder null, kills terminals, returns workspaceIds", async () => {
		seedActiveProject(getFakeDb());

		const result = await caller.archive({ id: PROJECT_ID });

		expect(result.success).toBe(true);
		expect(result.workspaceIds.sort()).toEqual([WS_ACTIVE, WS_DELETING].sort());
		expect(killByWorkspaceIdMock).toHaveBeenCalledTimes(2);
		expect(trackMock).toHaveBeenCalledWith("project_archived", {
			project_id: PROJECT_ID,
		});

		const row = getProjectRowById(getFakeDb(), PROJECT_ID);
		expect(row?.tabOrder).toBeNull();
		expect(row?.archivedAt).toBeNumber();
	});

	it("archive updates lastActiveWorkspace when it points into the project", async () => {
		seedActiveProject(getFakeDb());
		getFakeDb()
			.localDb.update(settings)
			.set({ lastActiveWorkspaceId: WS_ACTIVE })
			.where(eq(settings.id, 1))
			.run();

		await caller.archive({ id: PROJECT_ID });

		expect(getFakeDb().settings.lastActiveWorkspaceId).toBeNull();
	});

	it("archive rejects when already archived", async () => {
		seedActiveProject(getFakeDb());
		await caller.archive({ id: PROJECT_ID });

		await expect(caller.archive({ id: PROJECT_ID })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("archive rejects when project missing", async () => {
		await expect(
			caller.archive({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("archive surfaces terminalWarning when kill reports failures", async () => {
		seedActiveProject(getFakeDb());
		killByWorkspaceIdMock.mockResolvedValue({ failed: 1 });

		const result = await caller.archive({ id: PROJECT_ID });

		expect(result.terminalWarning).toContain("2");
		expect(result.terminalWarning).toContain("terminal");
	});

	it("getArchived returns archived projects with only non-deleting workspaces", async () => {
		seedActiveProject(getFakeDb());
		await caller.archive({ id: PROJECT_ID });

		const rows = await caller.getArchived();
		expect(rows).toHaveLength(1);
		expect(rows[0].project.id).toBe(PROJECT_ID);
		expect(rows[0].workspaces.map((w) => w.id)).toEqual([WS_ACTIVE]);
		expect(rows[0].workspaces[0].worktreePath).toBe("/tmp/archive-test-repo");
	});

	it("unarchive clears archivedAt and calls activateProject path", async () => {
		seedActiveProject(getFakeDb());
		const h = getFakeDb();
		const t = now();
		h.localDb
			.insert(projects)
			.values({
				id: OTHER_PROJECT_ID,
				mainRepoPath: "/tmp/other",
				name: "Other",
				color: "#111",
				tabOrder: 0,
				lastOpenedAt: t,
				createdAt: t,
				archivedAt: null,
				defaultBranch: null,
				configToastDismissed: null,
				workspaceBaseBranch: null,
				githubOwner: null,
				branchPrefixMode: null,
				branchPrefixCustom: null,
				worktreeBaseDir: null,
				hideImage: null,
				iconUrl: null,
				neonProjectId: null,
				defaultApp: null,
			} as ProjectRow)
			.run();

		h.localDb
			.insert(workspaces)
			.values({
				id: OTHER_WS,
				projectId: OTHER_PROJECT_ID,
				worktreeId: null,
				type: "branch",
				branch: "main",
				name: "o",
				tabOrder: 0,
				createdAt: t,
				updatedAt: t,
				lastOpenedAt: t,
				isUnread: false,
				isUnnamed: false,
				deletingAt: null,
				sectionId: null,
				portBase: null,
			} as WorkspaceRow)
			.run();

		await caller.archive({ id: PROJECT_ID });
		await caller.unarchive({ id: PROJECT_ID });

		const row = getProjectRowById(h, PROJECT_ID);
		expect(row?.archivedAt).toBeNull();
		expect(row?.tabOrder).toBe(1);

		expect(trackMock).toHaveBeenCalledWith("project_unarchived", {
			project_id: PROJECT_ID,
		});
	});

	it("unarchive rejects when not archived", async () => {
		seedActiveProject(getFakeDb());

		await expect(caller.unarchive({ id: PROJECT_ID })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("unarchive rejects when project missing", async () => {
		await expect(
			caller.unarchive({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
