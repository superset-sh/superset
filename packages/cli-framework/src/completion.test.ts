import { describe, expect, it } from "bun:test";
import { generateBashCompletion, generateZshCompletion } from "./completion";
import type { CommandNode } from "./help";
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

function node(
	name: string,
	partial: Partial<CommandNode> = {},
	children: CommandNode[] = [],
): CommandNode {
	return {
		name,
		children: new Map(children.map((child) => [child.name, child])),
		hasCommand: children.length === 0,
		...partial,
	};
}

function fixture(): CommandNode {
	return node(
		"",
		{
			hasCommand: false,
			options: {
				json: option({ name: "json", type: "boolean", description: "As JSON" }),
				apiKey: option({ name: "api-key", description: "API key" }),
			},
		},
		[
			node(
				"terminals",
				{ description: "Manage terminals", aliases: ["term"] },
				[
					node("explain", {
						description: "Explain a terminal's agent",
						options: {
							workspace: option({
								name: "workspace",
								aliases: ["w"],
								description: "Workspace: id or name",
							}),
							terminal: option({ name: "terminal" }),
							secret: option({ name: "secret", isHidden: true }),
						},
					}),
					node("wait", {
						options: { timeout: option({ name: "timeout", type: "number" }) },
					}),
					node("send-keys"),
				],
			),
			node("tasks", { description: "Manage tasks" }, [
				node("create", {
					options: {
						priority: option({
							name: "priority",
							enumVals: ["urgent", "high", "low"],
						}),
					},
				}),
			]),
			node("completion", {
				args: [
					option({ name: "shell", enumVals: ["alpha-shell", "beta-shell"] }),
				],
			}),
			node("status", { description: "Check host service status" }),
			// A meta.ts with no commands under it is not a real command.
			node("orphan", { hasCommand: false }),
		],
	);
}

const generators = [
	["bash", generateBashCompletion, "complete -F _superset superset"],
	["zsh", generateZshCompletion, "#compdef superset"],
] as const;

describe.each(generators)("%s completion", (_shell, generate, marker) => {
	const script = generate(fixture(), "superset");

	it("carries the shell's registration boilerplate", () => {
		expect(script).toContain(marker);
	});

	it("names every command, group, alias and sub-subcommand", () => {
		for (const name of [
			"terminals",
			"term",
			"explain",
			"wait",
			"send-keys",
			"tasks",
			"create",
			"completion",
			"status",
		]) {
			expect(script).toContain(name);
		}
	});

	it("offers each command's flags and their aliases", () => {
		expect(script).toContain("--workspace");
		expect(script).toContain("-w");
		expect(script).toContain("--terminal");
		expect(script).toContain("--timeout");
		expect(script).toContain("--priority");
	});

	it("offers the globals and --help everywhere", () => {
		expect(script).toContain("--json");
		expect(script).toContain("--api-key");
		expect(script).toContain("--help");
		expect(script).toContain("--version");
	});

	it("offers enum values for flags and positionals", () => {
		expect(script).toContain("urgent");
		expect(script).toContain("high");
		expect(script).toContain("alpha-shell");
		expect(script).toContain("beta-shell");
	});

	it("leaves out hidden options and command-less groups", () => {
		expect(script).not.toContain("--secret");
		expect(script).not.toContain("orphan");
	});

	it("produces a script for an empty tree", () => {
		const empty = generate(node("", { hasCommand: false }), "superset");
		expect(empty.length).toBeGreaterThan(0);
		expect(empty).toContain(marker);
	});
});

describe("generateZshCompletion", () => {
	it("registers the function and escapes colons in descriptions", () => {
		const script = generateZshCompletion(fixture(), "superset");
		expect(script).toContain("compdef _superset superset");
		expect(script).toContain("'--workspace:Workspace\\: id or name'");
	});
});

describe("generateBashCompletion", () => {
	it("derives a valid function name from a hyphenated binary", () => {
		const script = generateBashCompletion(fixture(), "my-cli");
		expect(script).toContain("_my_cli() {");
		expect(script).toContain("complete -F _my_cli my-cli");
	});
});
