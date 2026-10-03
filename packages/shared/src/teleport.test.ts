import { describe, expect, test } from "bun:test";
import {
	buildTeleportPlan,
	derivePaneDisposition,
	type TabPlan,
} from "./teleport";

const CLEAN = {
	modified: 0,
	untracked: 0,
	preciousFiles: 0,
	unpushedCommits: 0,
};

const TAB_WITH_AGENT: TabPlan = {
	tabId: "tab-1",
	title: "agent",
	panes: [
		{
			paneId: "pane-1",
			label: "claude",
			disposition: { kind: "agent-resumes", agent: "claude" },
		},
	],
};

describe("buildTeleportPlan", () => {
	test("says clone when the destination has no copy of the repository", () => {
		const plan = buildTeleportPlan({
			branch: "feature/login",
			destinationHostName: "beelink",
			destinationHasRepository: false,
			workingTree: CLEAN,
			tabs: [],
		});
		expect(plan.repository).toBe("clone");
	});

	test("says fetch when it already has one", () => {
		const plan = buildTeleportPlan({
			branch: "feature/login",
			destinationHostName: "beelink",
			destinationHasRepository: true,
			workingTree: CLEAN,
			tabs: [],
		});
		expect(plan.repository).toBe("fetch");
	});

	test("is empty when there is no work and no panes", () => {
		const plan = buildTeleportPlan({
			branch: "main",
			destinationHostName: "beelink",
			destinationHasRepository: true,
			workingTree: CLEAN,
			tabs: [{ tabId: "tab-1", title: "shell", panes: [] }],
		});
		expect(plan.isEmpty).toBe(true);
	});

	test("is not empty when only ignored env files would move", () => {
		// The case worth getting right: a clean checkout whose .env is the
		// entire reason the move is worth making.
		const plan = buildTeleportPlan({
			branch: "main",
			destinationHostName: "beelink",
			destinationHasRepository: true,
			workingTree: { ...CLEAN, preciousFiles: 1 },
			tabs: [],
		});
		expect(plan.isEmpty).toBe(false);
	});

	test("is not empty when a pane is running", () => {
		const plan = buildTeleportPlan({
			branch: "main",
			destinationHostName: "beelink",
			destinationHasRepository: true,
			workingTree: CLEAN,
			tabs: [TAB_WITH_AGENT],
		});
		expect(plan.isEmpty).toBe(false);
	});

	test("carries refusals through untouched", () => {
		const plan = buildTeleportPlan({
			branch: "main",
			destinationHostName: "beelink",
			destinationHasRepository: true,
			workingTree: CLEAN,
			tabs: [],
			refusals: [{ kind: "branch-checked-out", branch: "main", path: "/repo" }],
		});
		expect(plan.refusals).toHaveLength(1);
	});
});

describe("derivePaneDisposition", () => {
	test("resumes an agent with a session the harness can restore", () => {
		expect(
			derivePaneDisposition({
				agentId: "claude",
				agentSessionId: "abc123",
				canResumeSession: true,
				foregroundCommand: "claude",
			}),
		).toEqual({ kind: "agent-resumes", agent: "claude" });
	});

	test("restarts an agent whose harness cannot resume by id", () => {
		expect(
			derivePaneDisposition({
				agentId: "grok",
				agentSessionId: "abc123",
				canResumeSession: false,
				foregroundCommand: "grok",
			}),
		).toEqual({ kind: "agent-restarts", agent: "grok" });
	});

	test("restarts an agent that never reported a session", () => {
		expect(
			derivePaneDisposition({
				agentId: "claude",
				agentSessionId: null,
				canResumeSession: true,
				foregroundCommand: "claude",
			}),
		).toEqual({ kind: "agent-restarts", agent: "claude" });
	});

	test("an agent outranks the command it is running", () => {
		// A pane bound to an agent is an agent pane, even though its
		// foreground process is just the harness binary.
		expect(
			derivePaneDisposition({
				agentId: "claude",
				agentSessionId: "abc123",
				canResumeSession: true,
				foregroundCommand: "bun dev",
			}).kind,
		).toBe("agent-resumes");
	});

	test("restarts a plain long-running process", () => {
		expect(
			derivePaneDisposition({
				agentId: null,
				agentSessionId: null,
				canResumeSession: false,
				foregroundCommand: "bun dev",
			}),
		).toEqual({ kind: "process-restarts", command: "bun dev" });
	});

	test("opens an empty shell for a pane running nothing", () => {
		expect(
			derivePaneDisposition({
				agentId: null,
				agentSessionId: null,
				canResumeSession: false,
				foregroundCommand: null,
			}),
		).toEqual({ kind: "shell-opens" });
	});
});
