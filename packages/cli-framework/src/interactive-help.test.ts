import { describe, expect, it } from "bun:test";
import type { CommandNode } from "./help";
import {
	buildRunArgs,
	collectRequiredFields,
	formatAssembledCommand,
	runInteractiveHelp,
} from "./interactive-help";
import type { ProcessedBuilderConfig } from "./option";

function option(
	partial: Partial<ProcessedBuilderConfig> & { name: string },
): ProcessedBuilderConfig {
	return {
		type: "string",
		aliases: [],
		isRequired: false,
		isHidden: false,
		isVariadic: false,
		...partial,
	} as ProcessedBuilderConfig;
}

function leaf(config: {
	options?: Record<string, ProcessedBuilderConfig>;
	args?: ProcessedBuilderConfig[];
}): CommandNode {
	return {
		name: "cmd",
		children: new Map(),
		hasCommand: true,
		options: config.options,
		args: config.args,
	};
}

describe("collectRequiredFields", () => {
	it("returns nothing for a command with no required inputs", () => {
		const node = leaf({
			options: { limit: option({ name: "limit", type: "number" }) },
		});
		expect(collectRequiredFields(node)).toEqual([]);
	});

	it("picks required flags and keeps enum values", () => {
		const node = leaf({
			options: {
				type: option({
					name: "type",
					isRequired: true,
					enumVals: ["bug", "feature", "general"],
				}),
				title: option({ name: "title", isRequired: true }),
				body: option({ name: "body" }),
			},
		});
		const fields = collectRequiredFields(node);
		expect(fields.map((f) => f.name)).toEqual(["type", "title"]);
		expect(fields[0]?.enumVals).toEqual(["bug", "feature", "general"]);
	});

	it("treats required-with-default as not required", () => {
		const node = leaf({
			options: {
				port: option({
					name: "port",
					type: "number",
					isRequired: true,
					default: 8080,
				}),
			},
		});
		expect(collectRequiredFields(node)).toEqual([]);
	});

	it("preserves enum values on required positionals", () => {
		const fields = collectRequiredFields(
			leaf({
				args: [
					option({
						name: "level",
						isRequired: true,
						enumVals: ["low", "high"],
					}),
				],
			}),
		);
		expect(fields[0]?.enumVals).toEqual(["low", "high"]);
	});

	it("puts required positionals before flags", () => {
		const node = leaf({
			args: [option({ name: "id", isRequired: true })],
			options: { force: option({ name: "force", isRequired: true }) },
		});
		expect(collectRequiredFields(node).map((f) => f.kind)).toEqual([
			"positional",
			"flag",
		]);
	});
});

describe("buildRunArgs", () => {
	it("assembles path, positionals, then flag pairs", () => {
		const fields = collectRequiredFields(
			leaf({
				args: [option({ name: "id", isRequired: true })],
				options: { name: option({ name: "name", isRequired: true }) },
			}),
		);
		expect(
			buildRunArgs(["tasks", "update"], fields, ["t-1", "New title"]),
		).toEqual(["tasks", "update", "t-1", "--name", "New title"]);
	});

	it("emits --flag for true and --no-flag for false booleans", () => {
		const fields = [
			{ kind: "flag", name: "force", type: "boolean" } as const,
			{ kind: "flag", name: "dry-run", type: "boolean" } as const,
		];
		// A required boolean must appear either way; the parser supports
		// --no-<flag> negation.
		expect(buildRunArgs(["ws", "rm"], [...fields], [true, false])).toEqual([
			"ws",
			"rm",
			"--force",
			"--no-dry-run",
		]);
	});

	it("expands a variadic positional from one space-separated line", () => {
		const fields = collectRequiredFields(
			leaf({
				args: [option({ name: "ids", isRequired: true, isVariadic: true })],
			}),
		);
		expect(fields[0]?.variadic).toBe(true);
		expect(buildRunArgs(["tasks", "delete"], fields, ["a-1  b-2 c-3"])).toEqual(
			["tasks", "delete", "a-1", "b-2", "c-3"],
		);
	});

	it("repeats a variadic flag once per value", () => {
		const fields = [
			{
				kind: "flag",
				name: "attachment",
				type: "string",
				variadic: true,
			} as const,
		];
		expect(
			buildRunArgs(["agents", "create"], [...fields], ["a.png b.png"]),
		).toEqual([
			"agents",
			"create",
			"--attachment",
			"a.png",
			"--attachment",
			"b.png",
		]);
	});
});

describe("runInteractiveHelp", () => {
	it("resolves immediately when the signal is already aborted", async () => {
		const ac = new AbortController();
		ac.abort();
		const result = await runInteractiveHelp({
			name: "test",
			version: "0.0.0",
			root: { name: "test", children: new Map(), hasCommand: false },
			populateLeaf: () => {},
			signal: ac.signal,
		});
		expect(result).toEqual({});
	});
});

describe("formatAssembledCommand", () => {
	it("quotes values with spaces for display", () => {
		const fields = collectRequiredFields(
			leaf({ options: { title: option({ name: "title", isRequired: true }) } }),
		);
		expect(
			formatAssembledCommand("superset", ["tasks", "create"], fields, [
				"fix flaky tests",
			]),
		).toBe('superset tasks create --title "fix flaky tests"');
	});
});
