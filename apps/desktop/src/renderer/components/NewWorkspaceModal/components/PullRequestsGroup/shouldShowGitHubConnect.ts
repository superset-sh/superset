/**
 * Determines whether the "Connect GitHub" prompt should be shown
 * in the PR tab of the New Workspace modal.
 *
 * The prompt should only appear when GitHub is NOT connected as an
 * integration — not based on whether `githubOwner` can be parsed
 * from the local git remote URL.
 */
export function shouldShowGitHubConnect(isGitHubConnected: boolean): boolean {
	return !isGitHubConnected;
}
