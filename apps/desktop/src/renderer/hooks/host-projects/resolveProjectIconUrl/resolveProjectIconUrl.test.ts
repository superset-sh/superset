import { describe, expect, test } from "bun:test";
import { resolveProjectIconUrl } from "./resolveProjectIconUrl";

describe("resolveProjectIconUrl", () => {
	test("custom icon wins over the GitHub avatar", () => {
		expect(
			resolveProjectIconUrl({
				icon: "data:image/png;base64,AAAA",
				repoOwner: "acme",
			}),
		).toBe("data:image/png;base64,AAAA");
	});

	test("falls back to the GitHub owner avatar when no custom icon", () => {
		expect(resolveProjectIconUrl({ icon: null, repoOwner: "acme" })).toBe(
			"https://github.com/acme.png?size=64",
		);
	});

	test("returns null when there is neither a custom icon nor a repo owner", () => {
		expect(resolveProjectIconUrl({ icon: null, repoOwner: null })).toBeNull();
	});

	test("the 'none' sentinel suppresses the GitHub avatar fallback", () => {
		expect(
			resolveProjectIconUrl({ icon: "none", repoOwner: "acme" }),
		).toBeNull();
	});
});

describe("provider-bound project avatars", () => {
	for (const identity of [
		{
			repoProvider: "gitlab",
			repoUrl: "https://git.example.invalid:8443/Group/Sub/Widget",
		},
		{ repoProvider: "gitlab", repoUrl: null },
		{ repoProvider: null, repoUrl: "https://git.example.invalid/Group/Widget" },
		{ repoProvider: "github", repoUrl: "https://gitlab.com/Group/Widget" },
		{ repoProvider: null, repoUrl: "not a recognizable remote" },
		{ repoProvider: "other", repoUrl: null },
	])
		test(`refuses fabricated GitHub avatar for ${identity.repoProvider}:${identity.repoUrl}`, () => {
			const project = { icon: null, repoOwner: "Group/Sub", ...identity };
			expect(resolveProjectIconUrl(project)).toBeNull();
			expect(
				resolveProjectIconUrl({
					...project,
					icon: "data:image/png;base64,AAAA",
				}),
			).toBe("data:image/png;base64,AAAA");
			expect(resolveProjectIconUrl({ ...project, icon: "none" })).toBeNull();
		});
	for (const repoUrl of [
		null,
		"https://github.com/acme/widget",
		"git@github.com:acme/widget.git",
	])
		test(`retains genuine or legacy GitHub fallback ${repoUrl}`, () => {
			const project = {
				icon: null,
				repoOwner: "acme",
				repoProvider: null,
				repoUrl,
			};
			expect(resolveProjectIconUrl(project)).toBe(
				"https://github.com/acme.png?size=64",
			);
			expect(
				resolveProjectIconUrl({ ...project, repoProvider: "github" }),
			).toBe("https://github.com/acme.png?size=64");
		});
});
