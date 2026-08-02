import { describe, expect, test } from "bun:test";
import { resolvePresetImport } from "./presets";
import { decideProjectImport } from "./projects";
import { planHostBranchPrefix, planProjectPrefs } from "./settings";
import { planTerminalMigration } from "./terminals";
import { planWorkspaceAdoptions } from "./workspaces";

type Candidate = { id: string; source: string };
const findByPath = (candidates: Candidate[], cloudErrors: unknown[] = []) =>
	// Structural subset of ProjectFindByPathResult — decideProjectImport only
	// reads candidates/cloudErrors.
	({ candidates, cloudErrors }) as Parameters<typeof decideProjectImport>[0];

describe("decideProjectImport", () => {
	test("local-path candidate means already imported", () => {
		expect(
			decideProjectImport(
				findByPath([
					{ id: "cloud-1", source: "github-remote" },
					{ id: "v2-local", source: "local-path" },
				]),
			),
		).toEqual({ kind: "already-imported", v2ProjectId: "v2-local" });
	});

	test("multiple cloud candidates need a human", () => {
		expect(
			decideProjectImport(
				findByPath([
					{ id: "a", source: "github-remote" },
					{ id: "b", source: "github-remote" },
				]),
			),
		).toEqual({ kind: "skip", reason: "multiple-candidates" });
	});

	test("no candidates but cloud errors: don't risk a duplicate", () => {
		expect(
			decideProjectImport(findByPath([], [{ url: "x", message: "boom" }])),
		).toEqual({ kind: "skip", reason: "cloud-unreachable" });
	});

	test("single candidate or none imports", () => {
		expect(
			decideProjectImport(findByPath([{ id: "a", source: "github-remote" }])),
		).toEqual({ kind: "import" });
		expect(decideProjectImport(findByPath([]))).toEqual({ kind: "import" });
	});
});

describe("planWorkspaceAdoptions", () => {
	const base = {
		v1WorktreesById: new Map([
			["wt-1", { id: "wt-1", path: "/tree/feat", baseBranch: "main" }],
		]),
		v2ProjectIdByV1ProjectId: new Map([["v1-proj", "v2-proj"]]),
		hostWorkspaces: [{ id: "v2-ws", projectId: "v2-proj", branch: "done" }],
		onDiskBranchesByV2ProjectId: new Map([
			["v2-proj", new Set(["feat", "done"])],
		]),
	};
	const ws = (
		over: Partial<
			Parameters<typeof planWorkspaceAdoptions>[0]["v1Workspaces"][0]
		>,
	) => ({
		id: "v1-ws",
		projectId: "v1-proj",
		worktreeId: "wt-1" as string | null,
		name: "Feat",
		branch: "feat",
		...over,
	});

	test("adoptable workspace carries worktree path and base branch", () => {
		const plan = planWorkspaceAdoptions({ ...base, v1Workspaces: [ws({})] });
		expect(plan.toAdopt).toEqual([
			{
				v1WorkspaceId: "v1-ws",
				v1ProjectId: "v1-proj",
				v2ProjectId: "v2-proj",
				name: "Feat",
				branch: "feat",
				worktreePath: "/tree/feat",
				baseBranch: "main",
			},
		]);
	});

	test("branch already on host is linked, not re-adopted", () => {
		const plan = planWorkspaceAdoptions({
			...base,
			v1Workspaces: [ws({ branch: "done" })],
		});
		expect(plan.toAdopt).toHaveLength(0);
		expect(plan.alreadyAdopted[0]?.v2WorkspaceId).toBe("v2-ws");
	});

	test("branch with no on-disk worktree is unadoptable", () => {
		const plan = planWorkspaceAdoptions({
			...base,
			v1Workspaces: [ws({ branch: "gone" })],
		});
		expect(plan.missingWorktree).toHaveLength(1);
		expect(plan.toAdopt).toHaveLength(0);
	});

	test("unknown on-disk state stays adoptable (adopt decides)", () => {
		const plan = planWorkspaceAdoptions({
			...base,
			onDiskBranchesByV2ProjectId: new Map(),
			v1Workspaces: [ws({ branch: "gone", worktreeId: null })],
		});
		expect(plan.toAdopt).toHaveLength(1);
		expect(plan.toAdopt[0]?.worktreePath).toBeUndefined();
	});

	test("unmapped project defers the workspace", () => {
		const plan = planWorkspaceAdoptions({
			...base,
			v1Workspaces: [ws({ projectId: "other" })],
		});
		expect(plan.unmappedProject).toEqual(["v1-ws"]);
	});
});

describe("resolvePresetImport", () => {
	const agents = [{ id: "agent-cfg-1", presetId: "claude" }];

	test("built-in preset links to its agent config and keeps v2 on collision", () => {
		const resolved = resolvePresetImport({ name: "claude" }, agents, [
			{ name: "Claude Code", agentId: "agent-cfg-1" },
		]);
		expect(resolved.linkedAgentId).toBe("agent-cfg-1");
		expect(resolved.alreadyImported).toBe(true);
	});

	test("custom preset dedups by name", () => {
		expect(
			resolvePresetImport({ name: "my setup" }, agents, [
				{ name: "my setup", agentId: null },
			]).alreadyImported,
		).toBe(true);
		expect(
			resolvePresetImport({ name: "my setup" }, agents, []).alreadyImported,
		).toBe(false);
	});

	test("built-in preset without an agent config links to the raw agent id", () => {
		const resolved = resolvePresetImport({ name: "claude" }, [], []);
		expect(resolved.linkedAgentId).toBe("claude");
		expect(resolved.alreadyImported).toBe(false);
	});
});

describe("planHostBranchPrefix", () => {
	test("copies v1 prefix onto an unconfigured host", () => {
		expect(
			planHostBranchPrefix(
				{ mode: "github", customPrefix: null },
				{ mode: "none", customPrefix: null },
			),
		).toEqual({ action: "set", mode: "github", customPrefix: null });
	});

	test("custom mode carries its prefix string", () => {
		expect(
			planHostBranchPrefix(
				{ mode: "custom", customPrefix: "kiet/" },
				{ mode: null, customPrefix: null },
			),
		).toEqual({ action: "set", mode: "custom", customPrefix: "kiet/" });
	});

	test("configured host wins (keep-v2)", () => {
		expect(
			planHostBranchPrefix(
				{ mode: "github", customPrefix: null },
				{ mode: "author", customPrefix: null },
			),
		).toEqual({ action: "keep-v2" });
	});

	test("unconfigured v1 does nothing", () => {
		expect(
			planHostBranchPrefix(
				{ mode: "none", customPrefix: null },
				{ mode: "none", customPrefix: null },
			).action,
		).toBe("nothing");
		expect(
			planHostBranchPrefix(
				{ mode: null, customPrefix: null },
				{ mode: "github", customPrefix: null },
			).action,
		).toBe("nothing");
	});
});

describe("planProjectPrefs", () => {
	const noPrefs = {
		worktreeBaseDir: null,
		branchPrefixMode: null,
		branchPrefixCustom: null,
	};

	test("no v1 overrides means nothing to record", () => {
		expect(planProjectPrefs(noPrefs, noPrefs)).toBeNull();
	});

	test("applies v1 overrides where v2 is unset", () => {
		expect(
			planProjectPrefs(
				{
					worktreeBaseDir: "/trees",
					branchPrefixMode: "custom",
					branchPrefixCustom: "team/",
				},
				noPrefs,
			),
		).toEqual({
			setWorktreeBaseDir: "/trees",
			setBranchPrefix: { mode: "custom", customPrefix: "team/" },
			keptV2: false,
		});
	});

	test("keeps v2 values that are already configured", () => {
		expect(
			planProjectPrefs(
				{
					worktreeBaseDir: "/v1-trees",
					branchPrefixMode: "github",
					branchPrefixCustom: null,
				},
				{
					worktreeBaseDir: "/v2-trees",
					branchPrefixMode: null,
					branchPrefixCustom: null,
				},
			),
		).toEqual({
			setWorktreeBaseDir: null,
			setBranchPrefix: { mode: "github", customPrefix: null },
			keptV2: true,
		});
	});
});

describe("planTerminalMigration", () => {
	const panes = [
		{ paneId: "pane-1", v1WorkspaceId: "v1-ws", cwd: "/repo/feat" },
		{ paneId: "pane-2", v1WorkspaceId: "v1-ws", cwd: null },
		{ paneId: "pane-3", v1WorkspaceId: "v1-unmapped", cwd: "/x" },
	];
	let n = 0;
	const plan = planTerminalMigration({
		v1TerminalPanes: panes,
		v2WorkspaceIdByV1WorkspaceId: new Map([["v1-ws", "v2-ws"]]),
		newTerminalId: () => `term-${++n}`,
	});

	test("mapped panes queue under their v2 workspace with fresh ids", () => {
		expect(plan.pendingByV2WorkspaceId.get("v2-ws")).toEqual([
			{ terminalId: "term-1", cwd: "/repo/feat" },
			{ terminalId: "term-2", cwd: null },
		]);
		expect(plan.terminalIdByPaneId.get("pane-1")).toBe("term-1");
	});

	test("panes on unmigrated workspaces defer", () => {
		expect(plan.deferredPaneIds).toEqual(["pane-3"]);
		expect(plan.terminalIdByPaneId.has("pane-3")).toBe(false);
	});
});

// --- flip gate + completion markers (2026-08-01 fixes) ---

import {
	consumeV1ContinuityPending,
	consumeV1WelcomePending,
	isForcedFlipVersion,
	isV1FollowUpPending,
	isV1WelcomePending,
	markV1MigrationComplete,
	peekV1ContinuityPending,
	setV1FollowUpPending,
	V1_MIGRATION_COMPLETED_EVENT,
} from "./completion";
import { computeGateComplete, type KindSummary } from "./summary";
import { v1MigrationEventProps } from "./telemetry";

const summary = (overrides: Partial<KindSummary> = {}): KindSummary => ({
	migrated: 0,
	linked: 0,
	skipped: 0,
	failed: 0,
	deferred: 0,
	...overrides,
});

describe("computeGateComplete", () => {
	test("deliberate skips do not block the flip", () => {
		// The common aged-install shape: some workspaces have no worktree on
		// disk anymore, some repos are ambiguous — nothing left to migrate.
		expect(
			computeGateComplete(summary({ skipped: 2 }), summary({ skipped: 24 })),
		).toBe(true);
	});

	test("failures block the flip", () => {
		expect(computeGateComplete(summary({ failed: 1 }), summary())).toBe(false);
		expect(computeGateComplete(summary(), summary({ failed: 1 }))).toBe(false);
	});

	test("deferred work blocks the flip", () => {
		expect(computeGateComplete(summary({ deferred: 1 }), summary())).toBe(
			false,
		);
		expect(computeGateComplete(summary(), summary({ deferred: 3 }))).toBe(
			false,
		);
	});

	test("clean pass completes the gate", () => {
		expect(
			computeGateComplete(
				summary({ migrated: 2, linked: 1 }),
				summary({ migrated: 5, linked: 3 }),
			),
		).toBe(true);
	});
});

describe("isForcedFlipVersion", () => {
	test("disabled while unset", () => {
		expect(isForcedFlipVersion("1.19.0", null)).toBe(false);
	});

	test("flips at or past the forced version", () => {
		expect(isForcedFlipVersion("1.19.0", "1.19.0")).toBe(true);
		expect(isForcedFlipVersion("1.20.1", "1.19.0")).toBe(true);
		expect(isForcedFlipVersion("1.18.2", "1.19.0")).toBe(false);
	});

	test("tolerates missing or invalid versions", () => {
		expect(isForcedFlipVersion(undefined, "1.19.0")).toBe(false);
		expect(isForcedFlipVersion("not-a-version", "1.19.0")).toBe(false);
	});
});

describe("completion markers", () => {
	// completion.ts reads the global localStorage inside try/catch; give the
	// bun test runtime a Map-backed shim.
	const store = new Map<string, string>();
	// @ts-expect-error minimal Storage shim for tests
	globalThis.localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, String(v)),
		removeItem: (k: string) => void store.delete(k),
		get length() {
			return store.size;
		},
	};

	test("continuity peek is non-destructive; consume is one-shot", () => {
		markV1MigrationComplete("org-peek");
		expect(peekV1ContinuityPending("org-peek")).toBe(true);
		expect(peekV1ContinuityPending("org-peek")).toBe(true);
		expect(consumeV1ContinuityPending("org-peek")).toBe(true);
		expect(peekV1ContinuityPending("org-peek")).toBe(false);
		expect(consumeV1ContinuityPending("org-peek")).toBe(false);
	});

	test("re-completion does not re-arm continuity", () => {
		markV1MigrationComplete("org-rearm");
		expect(consumeV1ContinuityPending("org-rearm")).toBe(true);
		markV1MigrationComplete("org-rearm");
		expect(peekV1ContinuityPending("org-rearm")).toBe(false);
	});

	test("first completion dispatches the flip-notice event exactly once", () => {
		const events: string[] = [];
		// @ts-expect-error minimal DOM shims for the dispatch path
		globalThis.CustomEvent = class {
			type: string;
			detail: unknown;
			constructor(type: string, init?: { detail?: unknown }) {
				this.type = type;
				this.detail = init?.detail;
			}
		};
		// @ts-expect-error window shim: only dispatchEvent is used
		globalThis.window = {
			dispatchEvent: (e: { type: string }) => {
				events.push(e.type);
				return true;
			},
		};
		markV1MigrationComplete("org-evt");
		markV1MigrationComplete("org-evt"); // re-completion: no re-dispatch
		expect(events).toEqual([V1_MIGRATION_COMPLETED_EVENT]);
	});

	test("first completion arms the post-flip welcome; consume is dismiss-time", () => {
		markV1MigrationComplete("org-welcome");
		expect(isV1WelcomePending("org-welcome")).toBe(true);
		expect(isV1WelcomePending("org-welcome")).toBe(true); // read is non-destructive
		consumeV1WelcomePending("org-welcome");
		expect(isV1WelcomePending("org-welcome")).toBe(false);
		markV1MigrationComplete("org-welcome"); // re-completion never re-arms
		expect(isV1WelcomePending("org-welcome")).toBe(false);
	});

	test("follow-up flag set/clear round-trips", () => {
		expect(isV1FollowUpPending("org-fu")).toBe(false);
		setV1FollowUpPending("org-fu", true);
		expect(isV1FollowUpPending("org-fu")).toBe(true);
		setV1FollowUpPending("org-fu", false);
		expect(isV1FollowUpPending("org-fu")).toBe(false);
	});
});

describe("v1MigrationEventProps", () => {
	test("flattens per-kind counts into snake_case numeric props", () => {
		const props = v1MigrationEventProps({
			projects: summary({ failed: 2 }),
			workspaces: summary({ skipped: 23, migrated: 1 }),
			presets: summary({ linked: 6 }),
			settings: summary(),
			terminals: summary({ migrated: 1 }),
			gateComplete: false,
		});
		expect(props.gate_complete).toBe(false);
		expect(props.projects_failed).toBe(2);
		expect(props.workspaces_skipped).toBe(23);
		expect(props.workspaces_migrated).toBe(1);
		expect(props.presets_linked).toBe(6);
		expect(props.terminals_migrated).toBe(1);
		// 5 kinds x 5 counters + gate_complete
		expect(Object.keys(props)).toHaveLength(26);
	});
});
