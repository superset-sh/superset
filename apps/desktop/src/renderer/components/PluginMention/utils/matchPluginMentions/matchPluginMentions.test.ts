import { describe, expect, it } from "bun:test";
import type { PluginMentionOption } from "../../types";
import { matchPluginMentions } from "./matchPluginMentions";

const linear: PluginMentionOption = {
	name: "linear",
	displayName: "Linear",
	description: "Plan and build products: create, search, and update issues.",
};
const notion: PluginMentionOption = {
	name: "notion",
	displayName: "Notion",
	description: "Find and write pages in your workspace.",
};
const sentry: PluginMentionOption = {
	name: "sentry",
	displayName: "Sentry",
	description: "Investigate errors and issues in production.",
};
const gdocs: PluginMentionOption = {
	name: "gdocs",
	displayName: "Google Docs",
	description: "Read and edit documents.",
};

describe("matchPluginMentions", () => {
	it("returns every option for an empty query", () => {
		expect(matchPluginMentions([linear, notion], "")).toEqual([linear, notion]);
		expect(matchPluginMentions([linear, notion], "  ")).toEqual([
			linear,
			notion,
		]);
	});

	it("matches the name and display name case-insensitively", () => {
		expect(matchPluginMentions([notion, linear], "LIN")).toEqual([linear]);
		expect(matchPluginMentions([notion, linear], "near")).toEqual([linear]);
	});

	it("ranks prefix above substring above description, keeping input order within a rank", () => {
		expect(matchPluginMentions([sentry, linear, notion], "n")).toEqual([
			notion,
			sentry,
			linear,
		]);
		expect(matchPluginMentions([linear, sentry], "s")).toEqual([
			sentry,
			linear,
		]);
	});

	it("matches on the description as a last resort", () => {
		expect(matchPluginMentions([linear, notion, sentry], "errors")).toEqual([
			sentry,
		]);
	});

	it("matches a display name that differs from the manifest name", () => {
		expect(matchPluginMentions([linear, gdocs], "google")).toEqual([gdocs]);
		expect(matchPluginMentions([linear, gdocs], "docs")).toEqual([gdocs]);
	});

	it("drops options that match nowhere", () => {
		expect(matchPluginMentions([linear, notion], "slack")).toEqual([]);
	});
});
