import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedHostAgentConfig } from "./agents";
import {
	automationAgentRunInputSchema,
	buildAgentLaunchCommand,
	buildAgentLaunchEnv,
	resolveAutomationAgentTimeoutMs,
	runAutomationAgent,
} from "./agents";

function config(
	patch: Partial<ResolvedHostAgentConfig> = {},
): ResolvedHostAgentConfig {
	return {
		id: "agent-1",
		presetId: "claude",
		label: "Claude",
		command: "claude",
		args: ["--dangerously-skip-permissions"],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		...patch,
	};
}

describe("buildAgentLaunchCommand", () => {
	test("does not inject automation env into the visible shell command", () => {
		const command = buildAgentLaunchCommand(config(), "run report");

		expect(command).toStartWith("'claude'");
		expect(command).toContain("'--dangerously-skip-permissions'");
		expect(command).toContain("'run report'");
		expect(command).not.toContain("SUPERSET_AUTOMATION_RUN_TOKEN");
	});
});

describe("buildAgentLaunchEnv", () => {
	test("one-run env overrides persisted agent env for the launched process", () => {
		const env = buildAgentLaunchEnv(
			config({ env: { SUPERSET_API_URL: "https://old.example.com" } }),
			{ SUPERSET_API_URL: "https://new.example.com" },
		);

		expect(env.SUPERSET_API_URL).toBe("https://new.example.com");
	});

	test("keeps shell-sensitive token values as raw environment values", () => {
		const env = buildAgentLaunchEnv(config(), {
			SUPERSET_AUTOMATION_RUN_TOKEN: "tok'en with spaces",
		});

		expect(env.SUPERSET_AUTOMATION_RUN_TOKEN).toBe("tok'en with spaces");
	});
});

describe("automationAgentRunInputSchema", () => {
	test("preserves model selection for run-local model injection", () => {
		const parsed = automationAgentRunInputSchema.parse({
			runId: "11111111-1111-4111-8111-111111111111",
			automationId: "22222222-2222-4222-8222-222222222222",
			agent: "claude",
			prompt: "write a report",
			modelSelection: {
				providerId: "provider-1",
				modelId: "gpt-5.5",
				config: { reasoning: "high" },
			},
		});

		expect(parsed.modelSelection).toEqual({
			providerId: "provider-1",
			modelId: "gpt-5.5",
			config: { reasoning: "high" },
		});
	});
});

describe("resolveAutomationAgentTimeoutMs", () => {
	test("uses an explicit positive millisecond timeout when configured", () => {
		expect(
			resolveAutomationAgentTimeoutMs({
				SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS: "250",
			}),
		).toBe(250);
	});

	test("falls back when the configured timeout is invalid", () => {
		expect(
			resolveAutomationAgentTimeoutMs({
				SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS: "0",
			}),
		).toBe(30 * 60 * 1000);
		expect(
			resolveAutomationAgentTimeoutMs({
				SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS: "not-a-number",
			}),
		).toBe(30 * 60 * 1000);
	});
});

function createAgentDb(row: ResolvedHostAgentConfig) {
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					get: () => ({
						...row,
						argsJson: JSON.stringify(row.args),
						promptArgsJson: JSON.stringify(row.promptArgs),
						envJson: JSON.stringify(row.env),
						displayOrder: 0,
					}),
				}),
			}),
		}),
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const startedAt = Date.now();
	while (!predicate()) {
		if (Date.now() - startedAt > 3000) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe("runAutomationAgent", () => {
	test("runs from a Superset automation directory and completes without workspace input", async () => {
		const root = mkdtempSync(join(tmpdir(), "superset-automation-runs-"));
		const previousRoot = process.env.SUPERSET_AUTOMATION_RUNS_DIR;
		process.env.SUPERSET_AUTOMATION_RUNS_DIR = root;
		const completed: Array<{ runId: string; resultMarkdown: string }> = [];

		try {
			const ctx = {
				db: createAgentDb(
					config({
						command: "/bin/cat",
						args: [],
						promptTransport: "stdin",
						promptArgs: [],
					}),
				),
				api: {
					automation: {
						getRun: {
							query: async () => ({ status: "running" }),
						},
						completeRun: {
							mutate: async (input: {
								runId: string;
								resultMarkdown: string;
							}) => {
								completed.push(input);
								return { status: "completed" };
							},
						},
						failRun: {
							mutate: async () => {
								throw new Error("unexpected failRun");
							},
						},
					},
				},
			} as never;

			const runId = "11111111-1111-4111-8111-111111111111";
			const automationId = "22222222-2222-4222-8222-222222222222";
			const result = await runAutomationAgent(ctx, {
				runId,
				automationId,
				agent: "agent-1",
				prompt: "write a tiny report",
			});

			expect(result.kind).toBe("automation");
			expect(result.runDirectory).toBe(join(root, automationId));
			expect(
				existsSync(join(root, automationId, "runs", `${runId}.prompt.md`)),
			).toBe(true);

			await waitFor(() => completed.length === 1);
			expect(completed[0]?.runId).toBe(runId);
			expect(completed[0]?.resultMarkdown).toContain("write a tiny report");
		} finally {
			if (previousRoot === undefined) {
				delete process.env.SUPERSET_AUTOMATION_RUNS_DIR;
			} else {
				process.env.SUPERSET_AUTOMATION_RUNS_DIR = previousRoot;
			}
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails and kills the automation process when the agent times out", async () => {
		const root = mkdtempSync(join(tmpdir(), "superset-automation-runs-"));
		const previousRoot = process.env.SUPERSET_AUTOMATION_RUNS_DIR;
		const previousTimeout = process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS;
		process.env.SUPERSET_AUTOMATION_RUNS_DIR = root;
		process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS = "50";
		const failed: Array<{ runId: string; failureReason: string }> = [];

		try {
			const ctx = {
				db: createAgentDb(
					config({
						command: "/bin/sh",
						args: ["-c", "sleep 10"],
						promptTransport: "stdin",
						promptArgs: [],
					}),
				),
				api: {
					automation: {
						getRun: {
							query: async () => ({ status: "running" }),
						},
						completeRun: {
							mutate: async () => {
								throw new Error("unexpected completeRun");
							},
						},
						failRun: {
							mutate: async (input: {
								runId: string;
								failureReason: string;
							}) => {
								failed.push(input);
								return { status: "failed" };
							},
						},
					},
				},
			} as never;

			const runId = "33333333-3333-4333-8333-333333333333";
			await runAutomationAgent(ctx, {
				runId,
				automationId: "44444444-4444-4444-8444-444444444444",
				agent: "agent-1",
				prompt: "this should time out",
			});

			await waitFor(() => failed.length === 1);
			expect(failed[0]?.runId).toBe(runId);
			expect(failed[0]?.failureReason).toBe(
				"Automation agent timed out after 50ms",
			);
		} finally {
			if (previousRoot === undefined) {
				delete process.env.SUPERSET_AUTOMATION_RUNS_DIR;
			} else {
				process.env.SUPERSET_AUTOMATION_RUNS_DIR = previousRoot;
			}
			if (previousTimeout === undefined) {
				delete process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS;
			} else {
				process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS = previousTimeout;
			}
			rmSync(root, { recursive: true, force: true });
		}
	});
});
