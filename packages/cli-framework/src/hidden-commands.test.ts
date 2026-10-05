import { describe, expect, it } from "bun:test";
import { type CommandNode, generateGroupHelp } from "./help";

function leaf(name: string, hidden?: boolean): CommandNode {
	return {
		name,
		children: new Map(),
		hasCommand: true,
		...(hidden && { hidden }),
	};
}

/**
 * Runnable but unlisted, for a command another program invokes rather than a
 * person. Marking one `internal` instead makes it absent: an audience-gated
 * group is pruned before its children are read, so the command cannot be
 * routed to at all — which is how `superset mcp headers` was unreachable to
 * the agent meant to run it.
 */
describe("hidden commands", () => {
	const group: CommandNode = {
		name: "auth",
		children: new Map([
			["login", leaf("login")],
			["mcp-headers", leaf("mcp-headers", true)],
		]),
		hasCommand: false,
	};

	it("keeps a hidden command out of the group listing", () => {
		const help = generateGroupHelp("superset", ["auth"], group);
		expect(help).toContain("login");
		expect(help).not.toContain("mcp-headers");
	});

	it("still lists the group when only hidden children would be left", () => {
		const onlyHidden: CommandNode = {
			name: "auth",
			children: new Map([["mcp-headers", leaf("mcp-headers", true)]]),
			hasCommand: false,
		};
		const help = generateGroupHelp("superset", ["auth"], onlyHidden);
		expect(help).not.toContain("mcp-headers");
		// No empty "Commands:" heading with nothing under it.
		expect(help).not.toContain("Commands:");
	});
});
