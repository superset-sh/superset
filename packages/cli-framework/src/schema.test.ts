import { describe, expect, it } from "bun:test";
import type { CommandNode } from "./help";
import { generateSchema } from "./schema";

function makeNode(overrides: Partial<CommandNode> = {}): CommandNode {
	return {
		name: "",
		children: new Map(),
		hasCommand: false,
		...overrides,
	};
}

describe("generateSchema", () => {
	it("includes the bin name and every visible command, option, and arg", () => {
		const terminalsWait = makeNode({
			name: "wait",
			description: "Block until a terminal's agent reaches a status",
			hasCommand: true,
			options: {
				workspace: {
					name: "workspace",
					aliases: [],
					type: "string",
					isRequired: true,
				},
				timeout: {
					name: "timeout",
					aliases: [],
					type: "number",
					default: 120000,
				},
			},
		});
		const terminals = makeNode({
			name: "terminals",
			description: "Manage terminals",
			children: new Map([["wait", terminalsWait]]),
		});
		const root = makeNode({
			children: new Map([["terminals", terminals]]),
			options: {
				json: { name: "json", aliases: [], type: "boolean" },
			},
		});

		const schema = generateSchema(root, "superset");

		expect(schema.name).toBe("superset");
		expect(schema.globalOptions.map((o) => o.name)).toEqual(["json"]);
		expect(schema.commands).toHaveLength(1);
		const terminalsSchema = schema.commands[0];
		expect(terminalsSchema?.path).toEqual(["terminals"]);
		expect(terminalsSchema?.description).toBe("Manage terminals");
		expect(terminalsSchema?.commands).toHaveLength(1);

		const waitSchema = terminalsSchema?.commands[0];
		expect(waitSchema?.path).toEqual(["terminals", "wait"]);
		expect(waitSchema?.options).toEqual([
			{ name: "workspace", aliases: [], type: "string", required: true },
			{
				name: "timeout",
				aliases: [],
				type: "number",
				required: false,
				default: 120000,
			},
		]);
	});

	it("omits hidden and positional entries from options, but keeps positionals under args", () => {
		const leaf = makeNode({
			name: "explain",
			hasCommand: true,
			options: {
				secret: {
					name: "secret",
					aliases: [],
					type: "string",
					isHidden: true,
				},
				visible: { name: "visible", aliases: [], type: "string" },
			},
			args: [
				{ name: "shell", aliases: [], type: "positional", isRequired: true },
			],
		});
		const root = makeNode({ children: new Map([["explain", leaf]]) });

		const schema = generateSchema(root, "superset");

		const explainSchema = schema.commands[0];
		expect(explainSchema?.options.map((o) => o.name)).toEqual(["visible"]);
		expect(explainSchema?.args).toEqual([
			{ name: "shell", aliases: [], type: "positional", required: true },
		]);
	});

	it("produces an empty command list for an empty tree", () => {
		const schema = generateSchema(makeNode(), "superset");
		expect(schema.commands).toEqual([]);
		expect(schema.globalOptions).toEqual([]);
	});

	it("skips a child node that is neither a real command nor a group with children", () => {
		const emptyGroup = makeNode({ name: "ghost" });
		const root = makeNode({ children: new Map([["ghost", emptyGroup]]) });

		const schema = generateSchema(root, "superset");

		expect(schema.commands).toEqual([]);
	});
});
