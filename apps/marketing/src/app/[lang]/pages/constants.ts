import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

interface PagesItem {
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const LOOP_STEPS: PagesItem[] = [
	{
		title: msg({ message: "Create." }),
		description: msg({
			message:
				"Ask an agent for a design doc, a report, or a PR walkthrough. It builds the page and publishes it.",
		}),
	},
	{
		title: msg({ message: "Share." }),
		description: msg({
			message:
				"Send the link. Your team opens it in a browser, the app, or Slack.",
		}),
	},
	{
		title: msg({ message: "Comment." }),
		description: msg({
			message:
				"Teammates pin feedback to the exact heading, chart, or row they mean.",
		}),
	},
	{
		title: msg({ message: "Iterate." }),
		description: msg({
			message:
				"The agent watching the page gets each comment, updates it, publishes a new version, and replies.",
		}),
	},
];

export const FEATURES: PagesItem[] = [
	{
		title: msg({ message: "Every publish is a version" }),
		description: msg({
			message:
				"Publish again and the link stays the same. Earlier versions stay in the history.",
		}),
	},
	{
		title: msg({ message: "Share as wide as you need" }),
		description: msg({
			message:
				"Keep a draft to yourself, share it with your organization, or open it to anyone with the link.",
		}),
	},
	{
		title: msg({ message: "Works with any agent" }),
		description: msg({
			message:
				"Claude Code, Codex, and other agents publish through the Superset CLI, the Pages skill, or MCP.",
		}),
	},
	{
		title: msg({ message: "Read it on your phone" }),
		description: msg({
			message: "Open pages and reply to comments from the Superset iPhone app.",
		}),
	},
	{
		title: msg({ message: "Pages that remember" }),
		description: msg({
			message:
				"Polls, checklists, and sign-up sheets keep one answer per reader, with no backend to run.",
		}),
	},
	{
		title: msg({ message: "Previews in Slack" }),
		description: msg({
			message: "Shared links unfurl with a thumbnail of the page.",
		}),
	},
];
