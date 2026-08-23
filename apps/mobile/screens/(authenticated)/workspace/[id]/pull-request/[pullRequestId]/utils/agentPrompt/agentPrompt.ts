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
				.map((check) => check.name);
			const which =
				failing.length > 0 ? ` Failing: ${failing.join(", ")}.` : "";
			return `Checks are failing on ${pr}.${which} Find out why, fix the code, and push the fix to this branch.`;
		}
		case "ask-address-comments":
			return `Reviewers left feedback on ${pr}. Address the requested changes and unresolved review comments, then push your fixes.`;
	}
}
