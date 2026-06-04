import { describe, expect, it } from "bun:test";
import { resolveSlashPromptResult } from "./prompt-result";

describe("resolveSlashPromptResult", () => {
	it("returns handled=false when command was not handled", () => {
		expect(
			resolveSlashPromptResult({
				handled: false,
				prompt: "ignored",
				commandName: "review",
			}),
		).toEqual({ handled: false, nextText: "" });
	});

	it("returns rendered prompt text when non-empty", () => {
		expect(
			resolveSlashPromptResult({
				handled: true,
				prompt: "  Summarize staged changes  ",
				commandName: "review",
			}),
		).toEqual({ handled: false, nextText: "Summarize staged changes" });
	});

	it("returns handled=true with an error for empty rendered prompts", () => {
		expect(
			resolveSlashPromptResult({
				handled: true,
				prompt: "   ",
				invokedAs: "clear",
				commandName: "new",
			}),
		).toEqual({
			handled: true,
			nextText: "",
			errorMessage: "Slash command /clear produced an empty prompt",
		});
	});

	it("falls back to commandName for empty rendered prompts", () => {
		expect(
			resolveSlashPromptResult({
				handled: true,
				prompt: "",
				commandName: "review",
			}),
		).toEqual({
			handled: true,
			nextText: "",
			errorMessage: "Slash command /review produced an empty prompt",
		});
	});

	it("treats undefined prompt as empty and returns an error", () => {
		expect(
			resolveSlashPromptResult({
				handled: true,
				commandName: "review",
			}),
		).toEqual({
			handled: true,
			nextText: "",
			errorMessage: "Slash command /review produced an empty prompt",
		});
	});

	it("falls back to generic label when invokedAs and commandName are missing", () => {
		expect(
			resolveSlashPromptResult({
				handled: true,
				prompt: "",
			}),
		).toEqual({
			handled: true,
			nextText: "",
			errorMessage: "Slash command /command produced an empty prompt",
		});
	});
});
