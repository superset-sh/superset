import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface HowItWorksStep {
	number: string;
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
	{
		number: "01",
		title: msg({
			id: "marketing.howItWorks.startWithWork.title",
			message: "Start with the work.",
		}),
		description: msg({
			id: "marketing.howItWorks.startWithWork.description",
			message:
				"Describe what you need. Superset creates an isolated workspace and clean branch for the task.",
		}),
	},
	{
		number: "02",
		title: msg({
			id: "marketing.howItWorks.pickAgent.title",
			message: "Pick the best agent.",
		}),
		description: msg({
			id: "marketing.howItWorks.pickAgent.description",
			message:
				"Use Claude Code, Codex, or any coding agent. Choose per task or run several side by side.",
		}),
	},
	{
		number: "03",
		title: msg({
			id: "marketing.howItWorks.reviewResult.title",
			message: "Review the result.",
		}),
		description: msg({
			id: "marketing.howItWorks.reviewResult.description",
			message:
				"See what changed, give feedback, and merge the work when it's ready.",
		}),
	},
];
