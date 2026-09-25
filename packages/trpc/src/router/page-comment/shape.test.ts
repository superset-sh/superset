import { describe, expect, test } from "bun:test";
import { agentLabelFor } from "./shape";

const comment = (
	authorKind: "human" | "agent",
	agentSessionId: string | null,
) => ({ authorKind, agentSessionId });

describe("agentLabelFor", () => {
	test("a human comment has no agent label", () => {
		expect(agentLabelFor(comment("human", null))).toBeNull();
	});

	test("a human comment stays unlabelled even carrying a session id", () => {
		expect(agentLabelFor(comment("human", "mcp:claude"))).toBeNull();
	});

	test("names the agent an MCP call came from", () => {
		expect(agentLabelFor(comment("agent", "mcp:claude"))).toBe("Claude");
	});

	test("leaves an already-capitalised label alone", () => {
		expect(agentLabelFor(comment("agent", "mcp:Codex"))).toBe("Codex");
	});

	test("falls back when MCP could not name the caller", () => {
		expect(agentLabelFor(comment("agent", "mcp:unknown"))).toBe("Agent");
		expect(agentLabelFor(comment("agent", "mcp:"))).toBe("Agent");
	});

	test("a CLI agent's opaque session id is not shown as a name", () => {
		expect(agentLabelFor(comment("agent", "01a0a5a9-b259-72dd"))).toBe("Agent");
	});

	test("an agent row with no session id still reads as an agent", () => {
		expect(agentLabelFor(comment("agent", null))).toBe("Agent");
	});
});
