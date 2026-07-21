import type { HostServiceClient } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import {
	isTerminalStatus,
	ledgerKey,
	loadV1MigrationLedger,
	recordV1MigrationOutcomes,
	type V1LedgerMap,
	type V1LedgerOutcome,
} from "./ledger";
import {
	type AgentConfigLike,
	buildV2TerminalPresetRow,
	resolvePresetImport,
	type V2PresetLike,
} from "./presets";
import {
	decideProjectImport,
	findProjectByPath,
	importV1Project,
} from "./projects";
import { planHostBranchPrefix, planProjectPrefs } from "./settings";
import {
	type PendingMigratedTerminal,
	planTerminalMigration,
} from "./terminals";
import {
	adoptV1Workspace,
	planWorkspaceAdoptions,
	type V1WorktreeLike,
} from "./workspaces";

export interface KindSummary {
	migrated: number;
	linked: number;
	skipped: number;
	failed: number;
	/** Entities we deliberately left for a later run (e.g. project not yet imported). */
	deferred: number;
}

export interface V1MigrationSummary {
	projects: KindSummary;
	workspaces: KindSummary;
	presets: KindSummary;
	settings: KindSummary;
	terminals: KindSummary;
	/** D4 flip gate: every v1 project and workspace is success/linked in the ledger. */
	gateComplete: boolean;
}

export interface RunV1MigrationDeps {
	organizationId: string;
	hostClient: HostServiceClient;
	/**
	 * Preset targets live in renderer-only TanStack collections, so the
	 * caller supplies reads/writes. Omit to skip the preset step (it never
	 * gates the flip).
	 */
	presetTarget?: {
		agents: AgentConfigLike[];
		existing: V2PresetLike[];
		insert: (row: V2TerminalPresetRow) => void;
	};
	onProjectImported?: (result: {
		v2ProjectId: string;
		mainWorkspaceId: string | null;
		repoPath: string;
	}) => void;
	onWorkspaceAdopted?: (v2WorkspaceId: string, v2ProjectId: string) => void;
	/**
	 * Pending-terminal queue lives in the renderer-only workspace local
	 * state collection (D2: lazy recreation on first workspace open). Omit
	 * to skip the terminal step (never gates the flip).
	 */
	terminalTarget?: {
		appendPending: (
			workspace: { id: string; projectId: string },
			terminals: PendingMigratedTerminal[],
		) => void;
	};
}

function emptySummary(): KindSummary {
	return { migrated: 0, linked: 0, skipped: 0, failed: 0, deferred: 0 };
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Headless v1→v2 migration pass: projects → workspaces → presets, every
 * outcome recorded in the v1_migration_state ledger. Idempotent — ledger
 * rows with success/linked are skipped, and the underlying host calls
 * (findByPath, adopt) re-derive existing state rather than duplicating.
 * Safe to run on every boot while the user is still on v1.
 */
export async function runV1Migration(
	deps: RunV1MigrationDeps,
): Promise<V1MigrationSummary> {
	const { organizationId } = deps;
	const ledger = await loadV1MigrationLedger(organizationId);
	const outcomes: V1LedgerOutcome[] = [];
	// Flush between stages (and on failure) so a throw in a later stage
	// can't discard outcomes for host mutations that already committed.
	const flush = async () => {
		const batch = outcomes.splice(0);
		try {
			await recordV1MigrationOutcomes(organizationId, batch);
		} catch (err) {
			outcomes.unshift(...batch);
			throw err;
		}
	};

	let projects = emptySummary();
	let workspaces = emptySummary();
	let presets = emptySummary();
	let settings = emptySummary();
	let terminals = emptySummary();
	try {
		projects = await migrateProjects(deps, ledger, outcomes);
		await flush();
		workspaces = await migrateWorkspaces(deps, ledger, outcomes);
		await flush();
		settings = await migrateSettings(deps, ledger, outcomes);
		await flush();
		terminals = await migrateTerminals(deps, ledger, outcomes);
		await flush();
		presets = await migratePresets(deps, ledger, outcomes);
	} finally {
		await flush().catch((err) => {
			console.error("[v1-migration] ledger flush failed", err);
		});
	}

	const gateComplete =
		projects.failed + projects.skipped + projects.deferred === 0 &&
		workspaces.failed + workspaces.skipped + workspaces.deferred === 0;

	return { projects, workspaces, presets, settings, terminals, gateComplete };
}

async function migrateProjects(
	deps: RunV1MigrationDeps,
	ledger: V1LedgerMap,
	outcomes: V1LedgerOutcome[],
): Promise<KindSummary> {
	const summary = emptySummary();
	const v1Projects = await electronTrpcClient.migration.readV1Projects.query();

	for (const project of v1Projects) {
		const existing = ledger.get(ledgerKey("project", project.id));
		if (existing && isTerminalStatus(existing.status)) continue;

		try {
			const findByPathResult = await findProjectByPath(deps.hostClient, {
				id: project.id,
				name: project.name,
				mainRepoPath: project.mainRepoPath,
				githubOwner: project.githubOwner,
			});
			const decision = decideProjectImport(findByPathResult);

			if (decision.kind === "already-imported") {
				summary.linked++;
				pushOutcome(ledger, outcomes, {
					v1Id: project.id,
					kind: "project",
					status: "linked",
					v2Id: decision.v2ProjectId,
				});
				continue;
			}

			if (decision.kind === "skip") {
				summary.skipped++;
				pushOutcome(ledger, outcomes, {
					v1Id: project.id,
					kind: "project",
					status: "skipped",
					reason: decision.reason,
				});
				continue;
			}

			const result = await importV1Project({
				hostClient: deps.hostClient,
				project,
				findByPathResult,
			});

			if (result.kind === "needs-relocate") {
				summary.skipped++;
				pushOutcome(ledger, outcomes, {
					v1Id: project.id,
					kind: "project",
					status: "skipped",
					v2Id: result.v2ProjectId,
					reason: "needs-relocate",
				});
				continue;
			}

			summary.migrated++;
			pushOutcome(ledger, outcomes, {
				v1Id: project.id,
				kind: "project",
				status: "success",
				v2Id: result.v2ProjectId,
			});
			// The host mutation committed — a UI callback failure must not
			// overwrite the success outcome with an error.
			try {
				deps.onProjectImported?.(result);
			} catch (err) {
				console.error("[v1-migration] onProjectImported callback failed", {
					v1ProjectId: project.id,
					err,
				});
			}
		} catch (err) {
			summary.failed++;
			pushOutcome(ledger, outcomes, {
				v1Id: project.id,
				kind: "project",
				status: "error",
				reason: errorMessage(err),
			});
		}
	}

	return summary;
}

async function migrateWorkspaces(
	deps: RunV1MigrationDeps,
	ledger: V1LedgerMap,
	outcomes: V1LedgerOutcome[],
): Promise<KindSummary> {
	const summary = emptySummary();
	const [v1Projects, v1Workspaces, v1Worktrees, hostProjects, hostWorkspaces] =
		await Promise.all([
			electronTrpcClient.migration.readV1Projects.query(),
			electronTrpcClient.migration.readV1Workspaces.query(),
			electronTrpcClient.migration.readV1Worktrees.query(),
			deps.hostClient.project.list.query(),
			deps.hostClient.workspace.list.query(),
		]);

	// v1 project → v2 project via the ledger first (authoritative mapping
	// written by the project step), falling back to repo-path equality.
	const v2ProjectIdByV1ProjectId = new Map<string, string>();
	const v2ByRepoPath = new Map<string, string>();
	for (const p of hostProjects) {
		if (!v2ByRepoPath.has(p.repoPath)) v2ByRepoPath.set(p.repoPath, p.id);
	}
	for (const v1 of v1Projects) {
		const fromLedger = ledger.get(ledgerKey("project", v1.id));
		const v2Id =
			(fromLedger && isTerminalStatus(fromLedger.status)
				? fromLedger.v2Id
				: null) ?? v2ByRepoPath.get(v1.mainRepoPath);
		if (v2Id) v2ProjectIdByV1ProjectId.set(v1.id, v2Id);
	}

	const pendingWorkspaces = v1Workspaces.filter((w) => {
		const existing = ledger.get(ledgerKey("workspace", w.id));
		return !existing || !isTerminalStatus(existing.status);
	});

	const mappedV2ProjectIds = new Set(
		pendingWorkspaces
			.map((w) => v2ProjectIdByV1ProjectId.get(w.projectId))
			.filter((id): id is string => !!id),
	);
	const onDiskBranchesByV2ProjectId = new Map<string, Set<string>>();
	await Promise.all(
		Array.from(mappedV2ProjectIds, async (v2ProjectId) => {
			try {
				const result =
					await deps.hostClient.workspaceCreation.listProjectWorktrees.query({
						projectId: v2ProjectId,
					});
				onDiskBranchesByV2ProjectId.set(
					v2ProjectId,
					new Set(result.worktrees.map((w) => w.branch)),
				);
			} catch {
				// Leave unset: planWorkspaceAdoptions treats unknown as adoptable
				// and lets adopt() decide.
			}
		}),
	);

	const v1WorktreesById = new Map<string, V1WorktreeLike>(
		v1Worktrees.map((w) => [w.id, w]),
	);
	const plan = planWorkspaceAdoptions({
		v1Workspaces: pendingWorkspaces,
		v1WorktreesById,
		v2ProjectIdByV1ProjectId,
		hostWorkspaces,
		onDiskBranchesByV2ProjectId,
	});

	summary.deferred += plan.unmappedProject.length;

	for (const adopted of plan.alreadyAdopted) {
		summary.linked++;
		pushOutcome(ledger, outcomes, {
			v1Id: adopted.v1WorkspaceId,
			kind: "workspace",
			status: "linked",
			v2Id: adopted.v2WorkspaceId,
		});
	}

	for (const missing of plan.missingWorktree) {
		summary.skipped++;
		pushOutcome(ledger, outcomes, {
			v1Id: missing.v1WorkspaceId,
			kind: "workspace",
			status: "skipped",
			reason: "no-worktree-on-disk",
		});
	}

	for (const entry of plan.toAdopt) {
		try {
			const result = await adoptV1Workspace(deps.hostClient, entry);
			summary.migrated++;
			pushOutcome(ledger, outcomes, {
				v1Id: entry.v1WorkspaceId,
				kind: "workspace",
				status: "success",
				v2Id: result.workspace.id,
			});
			try {
				deps.onWorkspaceAdopted?.(result.workspace.id, entry.v2ProjectId);
			} catch (err) {
				console.error("[v1-migration] onWorkspaceAdopted callback failed", {
					v1WorkspaceId: entry.v1WorkspaceId,
					err,
				});
			}
		} catch (err) {
			summary.failed++;
			pushOutcome(ledger, outcomes, {
				v1Id: entry.v1WorkspaceId,
				kind: "workspace",
				status: "error",
				reason: errorMessage(err),
			});
		}
	}

	return summary;
}

/**
 * Settings that live in a different v2 store: host-wide branch prefix and
 * per-project worktree-dir / branch-prefix overrides (host.db). Everything
 * else is shared with v2 via the electron settings row, and the host-wide
 * worktree dir self-seeds from SUPERSET_LEGACY_WORKTREE_BASE_DIR. Keep-v2
 * on conflict; never gates the flip.
 */
async function migrateSettings(
	deps: RunV1MigrationDeps,
	ledger: V1LedgerMap,
	outcomes: V1LedgerOutcome[],
): Promise<KindSummary> {
	const summary = emptySummary();

	// Host-wide branch prefix (ledger id: "branch-prefix").
	const hostPrefixDone = ledger.get(ledgerKey("settings", "branch-prefix"));
	if (!hostPrefixDone || !isTerminalStatus(hostPrefixDone.status)) {
		try {
			const v1Settings =
				await electronTrpcClient.migration.readV1Settings.query();
			const hostPrefix =
				await deps.hostClient.settings.branchPrefix.get.query();
			const plan = planHostBranchPrefix(
				{
					mode: v1Settings?.branchPrefixMode ?? null,
					customPrefix: v1Settings?.branchPrefixCustom ?? null,
				},
				{ mode: hostPrefix.mode, customPrefix: hostPrefix.customPrefix },
			);
			if (plan.action === "set") {
				await deps.hostClient.settings.branchPrefix.set.mutate({
					mode: plan.mode,
					customPrefix: plan.customPrefix,
				});
				summary.migrated++;
				pushOutcome(ledger, outcomes, {
					v1Id: "branch-prefix",
					kind: "settings",
					status: "success",
				});
			} else if (plan.action === "keep-v2") {
				summary.linked++;
				pushOutcome(ledger, outcomes, {
					v1Id: "branch-prefix",
					kind: "settings",
					status: "linked",
				});
			}
			// "nothing": v1 never configured it — no ledger row, nothing to redo.
		} catch (err) {
			summary.failed++;
			pushOutcome(ledger, outcomes, {
				v1Id: "branch-prefix",
				kind: "settings",
				status: "error",
				reason: errorMessage(err),
			});
		}
	}

	// Per-project overrides (ledger id: "project-prefs:<v1ProjectId>").
	const v1Projects = await electronTrpcClient.migration.readV1Projects.query();
	for (const v1 of v1Projects) {
		const ledgerId = `project-prefs:${v1.id}`;
		const done = ledger.get(ledgerKey("settings", ledgerId));
		if (done && isTerminalStatus(done.status)) continue;

		const mapped = ledger.get(ledgerKey("project", v1.id));
		const v2ProjectId =
			mapped && isTerminalStatus(mapped.status) ? mapped.v2Id : null;
		if (!v2ProjectId) continue; // retried after the project migrates

		try {
			const v2Project = await deps.hostClient.project.get.query({
				projectId: v2ProjectId,
			});
			if (!v2Project) continue;
			const plan = planProjectPrefs(
				{
					worktreeBaseDir: v1.worktreeBaseDir,
					branchPrefixMode: v1.branchPrefixMode,
					branchPrefixCustom: v1.branchPrefixCustom,
				},
				{
					worktreeBaseDir: v2Project.worktreeBaseDir,
					branchPrefixMode: v2Project.branchPrefixMode ?? null,
					branchPrefixCustom: v2Project.branchPrefixCustom ?? null,
				},
			);
			if (!plan) continue; // no v1 overrides — nothing to record

			if (plan.setWorktreeBaseDir) {
				await deps.hostClient.project.setWorktreeBaseDir.mutate({
					projectId: v2ProjectId,
					path: plan.setWorktreeBaseDir,
				});
			}
			if (plan.setBranchPrefix) {
				await deps.hostClient.project.setBranchPrefix.mutate({
					projectId: v2ProjectId,
					mode: plan.setBranchPrefix.mode,
					customPrefix: plan.setBranchPrefix.customPrefix,
				});
			}
			const applied = !!plan.setWorktreeBaseDir || !!plan.setBranchPrefix;
			if (applied) summary.migrated++;
			else summary.linked++;
			pushOutcome(ledger, outcomes, {
				v1Id: ledgerId,
				kind: "settings",
				status: applied ? "success" : "linked",
				v2Id: v2ProjectId,
			});
		} catch (err) {
			summary.failed++;
			pushOutcome(ledger, outcomes, {
				v1Id: ledgerId,
				kind: "settings",
				status: "error",
				reason: errorMessage(err),
			});
		}
	}

	return summary;
}

/**
 * Queue each v1 terminal pane for lazy recreation (fresh shell at the v1
 * cwd) under its migrated workspace. Sessions are created on first
 * workspace open; useAutoAdoptBackgroundSessions builds the panes.
 */
async function migrateTerminals(
	deps: RunV1MigrationDeps,
	ledger: V1LedgerMap,
	outcomes: V1LedgerOutcome[],
): Promise<KindSummary> {
	const summary = emptySummary();
	const target = deps.terminalTarget;
	if (!target) return summary;

	const v1Panes =
		await electronTrpcClient.migration.readV1TerminalPanes.query();
	const pendingPanes = v1Panes.filter((pane) => {
		const done = ledger.get(ledgerKey("terminal", pane.paneId));
		return !done || !isTerminalStatus(done.status);
	});
	if (pendingPanes.length === 0) return summary;

	const v1Workspaces =
		await electronTrpcClient.migration.readV1Workspaces.query();
	const v2WorkspaceIdByV1WorkspaceId = new Map<string, string>();
	for (const w of v1Workspaces) {
		const row = ledger.get(ledgerKey("workspace", w.id));
		if (row && isTerminalStatus(row.status) && row.v2Id) {
			v2WorkspaceIdByV1WorkspaceId.set(w.id, row.v2Id);
		}
	}

	const plan = planTerminalMigration({
		v1TerminalPanes: pendingPanes,
		v2WorkspaceIdByV1WorkspaceId,
		newTerminalId: () => crypto.randomUUID(),
	});
	summary.deferred += plan.deferredPaneIds.length;
	if (plan.pendingByV2WorkspaceId.size === 0) return summary;

	const hostWorkspaces = await deps.hostClient.workspace.list.query();
	const projectIdByWorkspaceId = new Map(
		hostWorkspaces.map((w) => [w.id, w.projectId]),
	);

	for (const [v2WorkspaceId, terminals] of plan.pendingByV2WorkspaceId) {
		const paneIds = pendingPanes
			.filter(
				(p) =>
					plan.terminalIdByPaneId.has(p.paneId) &&
					terminals.some(
						(t) => t.terminalId === plan.terminalIdByPaneId.get(p.paneId),
					),
			)
			.map((p) => p.paneId);
		const projectId = projectIdByWorkspaceId.get(v2WorkspaceId);
		try {
			if (!projectId) {
				throw new Error("workspace missing from host list");
			}
			target.appendPending({ id: v2WorkspaceId, projectId }, terminals);
			for (const paneId of paneIds) {
				summary.migrated++;
				pushOutcome(ledger, outcomes, {
					v1Id: paneId,
					kind: "terminal",
					status: "success",
					v2Id: plan.terminalIdByPaneId.get(paneId),
				});
			}
		} catch (err) {
			for (const paneId of paneIds) {
				summary.failed++;
				pushOutcome(ledger, outcomes, {
					v1Id: paneId,
					kind: "terminal",
					status: "error",
					reason: errorMessage(err),
				});
			}
		}
	}

	return summary;
}

async function migratePresets(
	deps: RunV1MigrationDeps,
	ledger: V1LedgerMap,
	outcomes: V1LedgerOutcome[],
): Promise<KindSummary> {
	const summary = emptySummary();
	const target = deps.presetTarget;
	if (!target) return summary;

	const v1Presets =
		await electronTrpcClient.settings.getTerminalPresets.query();

	// Mutable copy: an insert this run must count as "existing" for the next
	// preset so two identically-named v1 presets don't both import.
	const existing = [...target.existing];

	for (const [index, preset] of v1Presets.entries()) {
		const done = ledger.get(ledgerKey("preset", preset.id));
		if (done && isTerminalStatus(done.status)) continue;

		try {
			const resolved = resolvePresetImport(preset, target.agents, existing);
			if (resolved.alreadyImported) {
				summary.linked++;
				pushOutcome(ledger, outcomes, {
					v1Id: preset.id,
					kind: "preset",
					status: "linked",
				});
				continue;
			}
			const row = buildV2TerminalPresetRow(preset, index, resolved);
			target.insert(row);
			existing.push({ name: row.name, agentId: row.agentId });
			summary.migrated++;
			pushOutcome(ledger, outcomes, {
				v1Id: preset.id,
				kind: "preset",
				status: "success",
				v2Id: row.id,
			});
		} catch (err) {
			summary.failed++;
			pushOutcome(ledger, outcomes, {
				v1Id: preset.id,
				kind: "preset",
				status: "error",
				reason: errorMessage(err),
			});
		}
	}

	return summary;
}

function pushOutcome(
	ledger: V1LedgerMap,
	outcomes: V1LedgerOutcome[],
	outcome: V1LedgerOutcome,
): void {
	outcomes.push(outcome);
	ledger.set(ledgerKey(outcome.kind, outcome.v1Id), {
		status: outcome.status,
		v2Id: outcome.v2Id ?? null,
	});
}
