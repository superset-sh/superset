/**
 * GitHub serves a username's avatar at this stable redirect, so a preview
 * thumbnail needs no API call — just the login we already have from the PR.
 */
export function githubAvatarUrl(login: string): string {
	return `https://github.com/${login}.png?size=64`;
}
