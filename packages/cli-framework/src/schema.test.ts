import { describe, expect, it } from "bun:test";
import type { CommandNode } from "./help";
import type { ProcessedBuilderConfig } from "./option";
import { generateSchema } from "./schema";

function option(
	partial: Partial<ProcessedBuilderConfig> & { name: string },
): ProcessedBuilderConfig {
	return { type: "string", aliases: [], ...partial };
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
				quiet: option({ name: "quiet", type: "boolean" }),
				json: option({ name: "json", type: "boolean", description: "As JSON" }),
			},
		},
		[
			node(
				"terminals",
				{ description: "Manage terminals", aliases: ["term"] },
				[
					node("read", {
						description: "Read a terminal",
						options: {
							workspace: option({
								name: "workspace",
								aliases: ["w"],
								isRequired: true,
								description: "Workspace id",
							}),
							lines: option({
								name: "lines",
								type: "number",
								default: 200,
								isInt: true,
								minVal: 1,
								maxVal: 5000,
							}),
							apiKey: option({
								name: "api-key",
								envVar: "SUPERSET_API_KEY",
								conflictsWith: ["workspace"],
							}),
							secret: option({ name: "secret", isHidden: true }),
						},
					}),
				],
			),
			node("completion", {
				args: [
					option({
						name: "shell",
						type: "positional",
						isRequired: true,
						enumVals: ["bash", "zsh"],
						description: "Shell",
					}),
					option({ name: "extra", type: "positional", isVariadic: true }),
				],
			}),
			node("ghost", { hasCommand: false }),
		],
	);
}

describe("generateSchema", () => {
	const schema = generateSchema({
		name: "superset",
		version: "1.2.3",
		root: fixture(),
	});

	it("names the CLI, its version and the globals from the root node", () => {
		expect(schema.name).toBe("superset");
		expect(schema.version).toBe("1.2.3");
		expect(schema.globalOptions.map((o) => o.name)).toEqual(["json", "quiet"]);
	});

	it("walks groups into commands, keeping aliases and descriptions", () => {
		expect(schema.commands.map((c) => c.path)).toEqual([
			["completion"],
			["terminals"],
		]);
		const terminals = schema.commands[1];
		expect(terminals?.description).toBe("Manage terminals");
		expect(terminals?.aliases).toEqual(["term"]);
		expect(terminals?.commands.map((c) => c.path)).toEqual([
			["terminals", "read"],
		]);
	});

	it("lists a command's visible options sorted by name with every constraint", () => {
		const read = schema.commands[1]?.commands[0];
		expect(read?.options).toEqual([
			{
				name: "api-key",
				aliases: [],
				type: "string",
				required: false,
				env: "SUPERSET_API_KEY",
				conflicts: ["workspace"],
			},
			{
				name: "lines",
				aliases: [],
				type: "number",
				required: false,
				default: 200,
				int: true,
				min: 1,
				max: 5000,
			},
			{
				name: "workspace",
				aliases: ["w"],
				type: "string",
				required: true,
				description: "Workspace id",
			},
		]);
	});

	it("keeps positionals in declaration order under args", () => {
		expect(schema.commands[0]?.args).toEqual([
			{
				name: "shell",
				required: true,
				description: "Shell",
				enum: ["bash", "zsh"],
			},
			{ name: "extra", required: false, variadic: true },
		]);
		expect(schema.commands[0]?.options).toEqual([]);
	});

	it("skips a group that holds no command", () => {
		expect(schema.commands.some((c) => c.path[0] === "ghost")).toBe(false);
	});

	it("serializes identically whatever the insertion order", () => {
		const reordered = fixture();
		reordered.children = new Map([...reordered.children.entries()].reverse());
		const read = reordered.children.get("terminals")?.children.get("read");
		if (read?.options) {
			read.options = Object.fromEntries(Object.entries(read.options).reverse());
		}
		const again = generateSchema({
			name: "superset",
			version: "1.2.3",
			root: reordered,
		});
		expect(JSON.stringify(again)).toBe(JSON.stringify(schema));
	});

	it("produces an empty command list for an empty tree", () => {
		const empty = generateSchema({
			name: "superset",
			version: "0.0.0",
			root: node("", { hasCommand: false }),
		});
		expect(empty.commands).toEqual([]);
		expect(empty.globalOptions).toEqual([]);
	});
});
