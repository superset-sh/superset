import { describe, expect, test } from "bun:test";
import { planEnvFile } from "./planEnvFile";

describe("planEnvFile", () => {
	test("skips names the sandbox owns and agent keys, and sets the rest", () => {
		const plan = planEnvFile([
			{ key: "PORT", value: "3000" },
			{ key: "SUPERSET_WORKSPACE_NAME", value: "laptop" },
			{ key: "ANTHROPIC_API_KEY", value: "sk-ant" },
			{ key: "NEON_PROJECT_ID", value: "frosty" },
		]);
		expect(plan.set).toEqual([{ key: "NEON_PROJECT_ID", value: "frosty" }]);
		expect(plan.skipped.map((entry) => entry.key)).toEqual([
			"PORT",
			"SUPERSET_WORKSPACE_NAME",
			"ANTHROPIC_API_KEY",
		]);
	});

	test("a repeated name keeps its last value", () => {
		const plan = planEnvFile([
			{ key: "DATABASE_URL", value: "first" },
			{ key: "OTHER", value: "x" },
			{ key: "DATABASE_URL", value: "second" },
		]);
		expect(plan.set).toEqual([
			{ key: "OTHER", value: "x" },
			{ key: "DATABASE_URL", value: "second" },
		]);
	});
});
