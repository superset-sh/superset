// Imported from the concrete modules, not the barrel: status.ts pulls in
// lucide-react-native, which bun test cannot load.
import { effectiveCheckStatus } from "../../../../utils/pullRequest/checks";
import type { PullRequestDetail } from "../../../../utils/pullRequest/types";
import type { AgentActionId } from "../pullRequestState";

/**
 * The instruction an agent action sends, in the agent's own words: what is
 * wrong with the pull request and what pushing a fix looks like. Sent as-is
 * the moment the button is tapped — there is no edit step.
 */
export function agentPrompt(
	action: AgentActionId,
	{ pullRequest, checks }: PullRequestDetail,
): string {
	const pr = `PR #${pullRequest.number} (${pullRequest.url})`;
	switch (action) {
		case "ask-resolve-conflicts":
			return `${pr} has merge conflicts with ${pullRequest.baseBranch}. Resolve them on this branch and push the result.`;
		case "ask-fix-checks": {
			const failing = checks
				.filter((check) => effectiveCheckStatus(check) === "failed")
				.map(quotedCheckName);
			const named = failing.slice(0, MAX_NAMED_CHECKS);
			const more = failing.length - named.length;
			const which =
				named.length > 0
					? ` Failing: ${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`
					: "";
			return `Checks are failing on ${pr}.${which} Find out why, fix the code, and push the fix to this branch.`;
		}
		case "ask-address-comments":
			return `Reviewers left feedback on ${pr}. Address the requested changes and unresolved review comments, then push your fixes.`;
	}
}

const MAX_NAMED_CHECKS = 10;
const MAX_CHECK_NAME_LENGTH = 80;

/**
 * Check names ride the PR head branch, so on a fork PR they are the
 * contributor's text and this prompt is the only place such text reaches
 * instruction position. They go in as quoted data: control characters
 * stripped, length capped, double quotes swapped out.
 */
function quotedCheckName(check: { name: string }): string {
	const cleaned = check.name
		.replace(/\p{C}+/gu, " ")
		.replaceAll('"', "'")
		.trim()
		.slice(0, MAX_CHECK_NAME_LENGTH);
	return `"${cleaned}"`;
}
