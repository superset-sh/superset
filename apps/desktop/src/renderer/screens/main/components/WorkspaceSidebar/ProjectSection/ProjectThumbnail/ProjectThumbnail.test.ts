import { describe, expect, test } from "bun:test";
import { shouldShowGitHubAvatar } from "./ProjectThumbnail";

/**
 * Reproduces GitHub issue #1847:
 * When a project's image is hidden via "Hide Image", the setting was only
 * honoured in the expanded sidebar view. In the collapsed sidebar,
 * ProjectHeader rendered ProjectThumbnail without passing the `hideImage`
 * prop, so it defaulted to undefined (falsy) and the avatar was always shown.
 *
 * Root cause: the collapsed-sidebar branch of ProjectHeader.tsx passed no
 * `hideImage` prop to ProjectThumbnail, leaving it as undefined.  When
 * `hideImage` is undefined the avatar check `!hideImage` evaluates to true,
 * so the avatar renders regardless of the user's preference.
 *
 * Fix: pass `hideImage={hideImage}` in the collapsed-sidebar branch so the
 * same setting is respected in both views.
 */
describe("shouldShowGitHubAvatar - hideImage (issue #1847)", () => {
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

	/**
	 * This case reproduces the bug: before the fix the collapsed sidebar
	 * omitted the `hideImage` prop, so it arrived here as `undefined`.
	 * `!undefined` is `true`, causing the avatar to render even when the
	 * user had enabled "Hide Image".
	 */
	test("shows avatar when hideImage is undefined (collapsed sidebar before fix)", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: "github-org",
				imageError: false,
				hideImage: undefined,
			}),
		).toBe(true);
	});

	test("does not show avatar when owner is absent", () => {
		expect(
			shouldShowGitHubAvatar({
				owner: null,
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
