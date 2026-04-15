import type { ContributorRegistry } from "../types";
import { agentInstructionsContributor } from "./agentInstructions";
import { attachmentContributor } from "./attachment";
import { githubIssueContributor } from "./githubIssue";
import { githubPrContributor } from "./githubPr";
import { internalTaskContributor } from "./internalTask";
import { userPromptContributor } from "./userPrompt";

export const defaultContributorRegistry: ContributorRegistry = {
	"user-prompt": userPromptContributor,
	attachment: attachmentContributor,
	"agent-instructions": agentInstructionsContributor,
	"github-issue": githubIssueContributor,
	"github-pr": githubPrContributor,
	"internal-task": internalTaskContributor,
};

export {
	agentInstructionsContributor,
	attachmentContributor,
	githubIssueContributor,
	githubPrContributor,
	internalTaskContributor,
	userPromptContributor,
};
