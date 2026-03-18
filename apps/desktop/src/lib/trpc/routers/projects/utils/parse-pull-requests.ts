/**
 * Parsed pull request from `gh pr list --json` output.
 */
export interface ParsedPullRequest {
	prNumber: number;
	title: string;
	url: string;
	state: string;
}

/**
 * Parses the JSON stdout from `gh pr list --json number,title,url,state,isDraft`
 * into a normalised array of pull requests.
 *
 * Returns an empty array when the input is empty, unparseable, or malformed.
 */
export function parseGhPrListOutput(stdout: string): ParsedPullRequest[] {
	const raw: unknown = JSON.parse(stdout.trim() || "[]");
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(
				item: unknown,
			): item is {
				number: number;
				title: string;
				url: string;
				state: string;
				isDraft: boolean;
			} =>
				typeof item === "object" &&
				item !== null &&
				"number" in item &&
				"title" in item &&
				"url" in item &&
				"state" in item,
		)
		.map((pr) => ({
			prNumber: pr.number,
			title: pr.title,
			url: pr.url,
			state: pr.isDraft
				? "draft"
				: pr.state === "OPEN"
					? "open"
					: pr.state.toLowerCase(),
		}));
}
