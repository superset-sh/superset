import { describe, expect, test } from "bun:test";
import { findGitHubReferences, resolveNamingLinks } from "./naming-links";

const repo = { owner: "acme", name: "app" };

describe("findGitHubReferences", () => {
	test("reads full issue and pull request URLs, dropping trailing punctuation", () => {
		expect(
			findGitHubReferences(
				"Fix https://github.com/acme/app/issues/7. See https://github.com/other/lib/pull/12,",
			),
		).toEqual([
			{
				owner: "acme",
				repo: "app",
				number: 7,
				label: "https://github.com/acme/app/issues/7",
			},
			{
				owner: "other",
				repo: "lib",
				number: 12,
				label: "https://github.com/other/lib/pull/12",
			},
		]);
	});

	test("resolves #123 against the project's repo, and ignores it without one", () => {
		expect(findGitHubReferences("Look at #123 and #123 again", repo)).toEqual([
			{ owner: "acme", repo: "app", number: 123, label: "#123" },
		]);
		expect(findGitHubReferences("Look at #123")).toEqual([]);
		expect(findGitHubReferences("see issue/#5 or path/#6", repo)).toEqual([]);
	});

	test("keeps at most two references", () => {
		expect(findGitHubReferences("#1 #2 #3", repo)).toHaveLength(2);
	});
});

describe("resolveNamingLinks", () => {
	const reference = { owner: "acme", repo: "app", number: 7, label: "#7" };
	const github = (
		get: () => Promise<{ data: { title: string; body: string | null } }>,
	) => ({ github: async () => ({ rest: { issues: { get } } }) }) as never;

	test("formats a found issue as label, title and body", async () => {
		const ctx = github(async () => ({
			data: { title: "Login fails on Safari", body: "Steps: open /login" },
		}));
		expect(await resolveNamingLinks(ctx, [reference])).toBe(
			"#7: Login fails on Safari\nSteps: open /login",
		);
	});

	test("skips lookups that fail or outlive the budget", async () => {
		const failing = github(async () => {
			throw new Error("404");
		});
		expect(await resolveNamingLinks(failing, [reference])).toBeUndefined();
		const hanging = github(() => new Promise(() => {}));
		expect(await resolveNamingLinks(hanging, [reference], 20)).toBeUndefined();
	});

	test("returns nothing without references and never calls GitHub", async () => {
		let calls = 0;
		const ctx = github(async () => {
			calls++;
			return { data: { title: "x", body: null } };
		});
		expect(await resolveNamingLinks(ctx, [])).toBeUndefined();
		expect(calls).toBe(0);
	});
});
