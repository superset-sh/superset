import { describe, expect, test } from "bun:test";
import type { ResolveCtx } from "../types";
import { userPromptContributor } from "./userPrompt";

const resolveCtx = {} as ResolveCtx; // not used by this contributor

describe("userPromptContributor", () => {
	test("metadata is set", () => {
		expect(userPromptContributor.kind).toBe("user-prompt");
		expect(userPromptContributor.displayName).toBeTruthy();
		expect(userPromptContributor.description).toBeTruthy();
		expect(userPromptContributor.requiresQuery).toBe(true);
	});

	test("resolves a prompt to a user-scoped text section", async () => {
		const section = await userPromptContributor.resolve(
			{ kind: "user-prompt", text: "refactor the auth middleware" },
			resolveCtx,
		);
		expect(section).toEqual({
			id: "user-prompt",
			kind: "user-prompt",
			scope: "user",
			label: "Prompt",
			content: [{ type: "text", text: "refactor the auth middleware" }],
		});
	});

	test("returns null for empty prompt", async () => {
		const section = await userPromptContributor.resolve(
			{ kind: "user-prompt", text: "   " },
			resolveCtx,
		);
		expect(section).toBeNull();
	});

	test("trims surrounding whitespace", async () => {
		const section = await userPromptContributor.resolve(
			{ kind: "user-prompt", text: "  hello  " },
			resolveCtx,
		);
		expect(section?.content).toEqual([{ type: "text", text: "hello" }]);
	});
});
