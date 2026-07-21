import { describe, expect, test } from "bun:test";
import { resolvePresetImport } from "./presets";
import { decideProjectImport } from "./projects";
import { planHostBranchPrefix, planProjectPrefs } from "./settings";
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
