import { describe, expect, it } from "bun:test";
import type { PluginMentionOption } from "../../types";
import { findPluginMentions } from "./findPluginMentions";

const linear: PluginMentionOption = {
	name: "linear",
	displayName: "Linear",
	description: "",
};
const resolve = (name: string) => (name === "linear" ? linear : null);

describe("findPluginMentions", () => {
	it("finds known handles at the start and after whitespace, excluding punctuation", () => {
		const text = "@linear then @linear. and @linear, done";
		const matches = findPluginMentions(text, resolve);
		expect(matches.map((match) => text.slice(match.start, match.end))).toEqual([
			"@linear",
			"@linear",
			"@linear",
		]);
		expect(matches.map((match) => match.plugin)).toEqual([
			linear,
			linear,
			linear,
		]);
	});

	it("skips unknown handles, glued handles and longer words", () => {
		expect(
			findPluginMentions("@slack mail a@linear read @linearfile", resolve),
		).toEqual([]);
	});
});
