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

	test("resolves a single text part", async () => {
		const section = await userPromptContributor.resolve(
			{
				kind: "user-prompt",
				content: [{ type: "text", text: "refactor the auth middleware" }],
			},
			resolveCtx,
		);
		expect(section).toEqual({
			id: "user-prompt",
			kind: "user-prompt",
			label: "Prompt",
			content: [{ type: "text", text: "refactor the auth middleware" }],
		});
	});

	test("returns null for empty content", async () => {
		const section = await userPromptContributor.resolve(
			{ kind: "user-prompt", content: [] },
			resolveCtx,
		);
		expect(section).toBeNull();
	});

	test("returns null when only whitespace text parts are present", async () => {
		const section = await userPromptContributor.resolve(
			{
				kind: "user-prompt",
				content: [
					{ type: "text", text: "   " },
					{ type: "text", text: "\n\n" },
				],
			},
			resolveCtx,
		);
		expect(section).toBeNull();
	});

	test("trims surrounding whitespace on bookend text parts", async () => {
		const section = await userPromptContributor.resolve(
			{
				kind: "user-prompt",
				content: [{ type: "text", text: "  hello  " }],
			},
			resolveCtx,
		);
		expect(section?.content).toEqual([{ type: "text", text: "hello" }]);
	});

	test("preserves interleaved multimodal content (text + image + text)", async () => {
		const imageBytes = new Uint8Array([1, 2, 3]);
		const section = await userPromptContributor.resolve(
			{
				kind: "user-prompt",
				content: [
					{ type: "text", text: "Reproduce this bug:" },
					{ type: "image", data: imageBytes, mediaType: "image/png" },
					{ type: "text", text: "with the attached logs." },
				],
			},
			resolveCtx,
		);
		expect(section?.content).toEqual([
			{ type: "text", text: "Reproduce this bug:" },
			{ type: "image", data: imageBytes, mediaType: "image/png" },
			{ type: "text", text: "with the attached logs." },
		]);
	});

	test("drops empty text parts between non-empty ones", async () => {
		const section = await userPromptContributor.resolve(
			{
				kind: "user-prompt",
				content: [
					{ type: "text", text: "first" },
					{ type: "text", text: "" },
					{ type: "text", text: "second" },
				],
			},
			resolveCtx,
		);
		expect(section?.content).toEqual([
			{ type: "text", text: "first" },
			{ type: "text", text: "second" },
		]);
	});
});
