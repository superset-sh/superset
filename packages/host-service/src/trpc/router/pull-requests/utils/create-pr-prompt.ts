import type { ResolvedCreatePrSkill } from "./create-pr-skill";
import {
	PROJECT_SKILL_RELATIVE_PATH,
	USER_SKILL_RELATIVE_PATH,
} from "./create-pr-skill";
import { formatPrContext, type PrContext } from "./pr-context";

function describeSkillSource(skill: ResolvedCreatePrSkill): string {
	if (skill.source === "bundled") {
		return `These are Superset's default instructions. To change how this project's pull requests are written, add ${PROJECT_SKILL_RELATIVE_PATH} to the repository; to change them for every project, edit ~/${USER_SKILL_RELATIVE_PATH}.`;
	}
	return `These instructions come from ${skill.path} — edit that file to change how pull requests are titled and described.`;
}

/**
 * The message dispatched to the agent: a short brief, the resolved skill
 * inline (so CLIs that can't slash-invoke a skill still follow it), then the
 * host-gathered branch context. One paste, no follow-up turns.
 */
export function buildCreatePrPrompt({
	skill,
	context,
	draft,
}: {
	skill: ResolvedCreatePrSkill;
	context: PrContext;
	draft: boolean;
}): string {
	const brief = [
		"Create a pull request for the current branch by following the `create-pr` skill below. The user clicked Create PR in Superset and expects the pull request to exist without further prompting: do not ask questions, and reply with the PR URL once it is open.",
		draft ? "Open it as a draft (`gh pr create --draft`)." : null,
		describeSkillSource(skill),
	]
		.filter((line): line is string => line !== null)
		.join("\n");

	return [
		brief,
		"",
		`<skill name="create-pr">`,
		skill.body,
		"</skill>",
		"",
		"<pr-context>",
		formatPrContext(context),
		"</pr-context>",
	].join("\n");
}
