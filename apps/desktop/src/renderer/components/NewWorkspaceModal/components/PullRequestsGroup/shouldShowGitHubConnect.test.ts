import { describe, expect, test } from "bun:test";
import { shouldShowGitHubConnect } from "./shouldShowGitHubConnect";

/**
 * Regression tests for GitHub issue #2362:
 *
 * The PullRequestsGroup component was previously checking `!githubOwner`
 * to decide whether to show the "Connect GitHub" prompt. `githubOwner` is
 * derived from parsing the local git remote URL, which is independent of
 * whether the user has actually connected their GitHub account via the
 * integrations page.
 *
 * This meant that even when GitHub was fully connected as an integration,
 * the PR tab could still show "Connect" if `githubOwner` was null.
 *
 * The fix checks the integration connection status (queried from
 * `integrationConnections` with `provider === "github"`), matching the
 * pattern used by the IssuesGroup component for Linear.
 */
describe("shouldShowGitHubConnect", () => {
	test("shows connect prompt when GitHub integration is not connected", () => {
		expect(shouldShowGitHubConnect(false)).toBe(true);
	});

	test("hides connect prompt when GitHub integration is connected", () => {
		expect(shouldShowGitHubConnect(true)).toBe(false);
	});

	test("bug scenario: GitHub connected but githubOwner is null should NOT show connect", () => {
		// This is the core regression scenario from #2362.
		// Even if githubOwner (from git remote) is null, the connect prompt
		// should not appear if GitHub is connected as an integration.
		const isGitHubConnected = true;
		// Previously this would have incorrectly shown the connect prompt
		// because the check was `!githubOwner` (which would be true when null).
		// Now we correctly check `!isGitHubConnected` instead.
		expect(shouldShowGitHubConnect(isGitHubConnected)).toBe(false);
	});
});
