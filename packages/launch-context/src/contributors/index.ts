import type { ContributorRegistry } from "../types";
import { attachmentContributor } from "./attachment";
import { githubIssueContributor } from "./githubIssue";
import { githubPrContributor } from "./githubPr";
import { internalTaskContributor } from "./internalTask";
import { userPromptContributor } from "./userPrompt";

export const defaultContributorRegistry: ContributorRegistry = {
	"user-prompt": userPromptContributor,
	attachment: attachmentContributor,
	"github-issue": githubIssueContributor,
	"github-pr": githubPrContributor,
	"internal-task": internalTaskContributor,
};

export {
	attachmentContributor,
	githubIssueContributor,
	githubPrContributor,
	internalTaskContributor,
	userPromptContributor,
};
