import { describe, expect, test } from "bun:test";
import { shouldShowGitHubAvatar } from "./ProjectThumbnail";

describe("shouldShowGitHubAvatar", () => {
	test("hides avatar when hideImage is true", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: "github-org",
				imageError: false,
				hideImage: true,
			}),
		).toBe(false);
	});

	test("shows avatar when hideImage is false", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: "github-org",
				imageError: false,
				hideImage: false,
			}),
		).toBe(true);
	});

	test("shows avatar when hideImage is undefined", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: "github-org",
				imageError: false,
				hideImage: undefined,
			}),
		).toBe(true);
	});

	test("does not show avatar when owner is null", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: null,
				imageError: false,
				hideImage: false,
			}),
		).toBe(false);
	});

	test("does not show avatar when owner is undefined", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: undefined,
				imageError: false,
				hideImage: false,
			}),
		).toBe(false);
	});

	test("does not show avatar when the image has errored", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: "github-org",
				imageError: true,
				hideImage: false,
			}),
		).toBe(false);
	});
});
