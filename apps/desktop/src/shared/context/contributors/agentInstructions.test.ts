import { describe, expect, test } from "bun:test";
import type { ResolveCtx } from "../types";
import { agentInstructionsContributor } from "./agentInstructions";

function makeCtx(read: (path: string) => Promise<string>): ResolveCtx {
	return {
		projectId: "p",
		signal: new AbortController().signal,
		fetchIssue: async () => {
			throw new Error("unused");
		},
		fetchPullRequest: async () => {
			throw new Error("unused");
		},
		fetchInternalTask: async () => {
			throw new Error("unused");
		},
		readAgentInstructions: read,
	};
}

describe("agentInstructionsContributor", () => {
	test("metadata", () => {
		expect(agentInstructionsContributor.kind).toBe("agent-instructions");
		expect(agentInstructionsContributor.requiresQuery).toBe(false);
	});

	test("reads the file and emits a cacheable system section", async () => {
		const section = await agentInstructionsContributor.resolve(
			{ kind: "agent-instructions", path: "/repo/AGENTS.md" },
			makeCtx(async () => "# Repo rules\n- Use bun"),
		);
		expect(section).toEqual({
			id: "agent-instructions:/repo/AGENTS.md",
			kind: "agent-instructions",
			scope: "system",
			label: "AGENTS.md",
			content: [{ type: "text", text: "# Repo rules\n- Use bun" }],
			cacheControl: "ephemeral",
		});
	});

	test("returns null when the file is empty", async () => {
		const section = await agentInstructionsContributor.resolve(
			{ kind: "agent-instructions", path: "/repo/AGENTS.md" },
			makeCtx(async () => "   "),
		);
		expect(section).toBeNull();
	});

	test("uses basename as label even with nested paths", async () => {
		const section = await agentInstructionsContributor.resolve(
			{ kind: "agent-instructions", path: "/a/b/c/CLAUDE.md" },
			makeCtx(async () => "content"),
		);
		expect(section?.label).toBe("CLAUDE.md");
	});

	test("propagates read errors", async () => {
		await expect(
			agentInstructionsContributor.resolve(
				{ kind: "agent-instructions", path: "/repo/AGENTS.md" },
				makeCtx(async () => {
					throw new Error("ENOENT");
				}),
			),
		).rejects.toThrow("ENOENT");
	});
});
