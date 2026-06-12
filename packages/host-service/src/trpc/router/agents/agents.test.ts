import { describe, expect, test } from "bun:test";
import type { ResolvedHostAgentConfig } from "./agents";
import { buildAgentLaunchCommand, buildAgentLaunchEnv } from "./agents";

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
