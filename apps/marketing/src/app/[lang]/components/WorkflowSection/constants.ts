import { msg } from "@lingui/core/macro";

export const WORKFLOWS = [
	{
		id: "design",
		href: "/blog/change-ui-with-your-coding-agent",
		title: msg({ message: "Send a UI change to your agent" }),
		description: msg({
			message:
				"Click an element in your preview and describe the change. Your agent receives the element context and a screenshot when available.",
		}),
		action: msg({ message: "Try Design Mode" }),
	},
	{
		id: "review",
		href: "/blog/send-pr-feedback-to-your-agent",
		title: msg({ message: "Send code review feedback to your agent" }),
		description: msg({
			message:
				"Select lines in a PR diff and write your feedback. Send it to a running agent or start a session in a workspace for that PR.",
		}),
		action: msg({ message: "Try PR review" }),
	},
	{
		id: "pages",
		href: "/blog/review-agent-work-with-pages",
		title: msg({ message: "Leave feedback on the work itself" }),
		description: msg({
			message:
				"Share an agent-created report or design as a Page. Pin a comment where you want a change, and the watching agent can publish an updated version.",
		}),
		action: msg({ message: "Try Pages" }),
	},
];
