import { describe, expect, test } from "bun:test";
import { describeScreen } from "./screenContext";

const names = {
	workspaceName: (id: string) => (id === "ws1" ? "auth-refactor" : null),
	pageTitle: (slug: string) =>
		slug === "usage-v2" ? "Usage dashboard v2" : null,
};

describe("describeScreen", () => {
	test("home", () => {
		expect(describeScreen("/", names)).toMatch(/home list/);
	});
	test("workspace terminal and its sheets", () => {
		expect(describeScreen("/workspace/ws1", names)).toBe(
			"User is looking at workspace auth-refactor (its terminal).",
		);
		expect(describeScreen("/workspace/ws1/sessions", names)).toMatch(
			/sessions/,
		);
		expect(describeScreen("/workspace/zzz/commits", names)).toMatch(
			/commits of workspace a workspace/,
		);
	});
	test("pages by title when known", () => {
		expect(describeScreen("/pages/usage-v2", names)).toBe(
			'User is looking at the page "Usage dashboard v2".',
		);
		expect(describeScreen("/pages/other", names)).toMatch(/a published page/);
	});
	test("screens that are not about the work say nothing", () => {
		expect(describeScreen("/settings", names)).toBeNull();
	});
});
