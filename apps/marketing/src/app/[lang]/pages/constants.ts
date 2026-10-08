import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type LoopStepId = "create" | "share" | "comment" | "iterate";

interface PagesItem {
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const LOOP_STEPS: (PagesItem & { id: LoopStepId })[] = [
	{
		id: "create",
		title: msg({ message: "Create." }),
		description: msg({
			message:
				"Ask an agent for a design doc or a report. It builds the page and publishes it.",
		}),
	},
	{
		id: "share",
		title: msg({ message: "Share." }),
		description: msg({
			message: "Send the link. Your team opens it in a browser or in Superset.",
		}),
	},
	{
		id: "comment",
		title: msg({ message: "Comment." }),
		description: msg({
			message:
				"Teammates pin feedback to the exact part of the page they mean.",
		}),
	},
	{
		id: "iterate",
		title: msg({ message: "Iterate." }),
		description: msg({
			message:
				"The agent watching the page reads each comment. It updates the page and replies in the thread.",
		}),
	},
];

export const FEATURES: PagesItem[] = [
	{
		title: msg({ message: "Every publish is a version" }),
		description: msg({
			message:
				"Publish again and the link stays the same. Earlier versions are kept in the history.",
		}),
	},
	{
		title: msg({ message: "Works with any agent" }),
		description: msg({
			message: "Publish from the Superset CLI or over MCP.",
		}),
	},
	{
		title: msg({ message: "Read it on your phone" }),
		description: msg({
			message: "Open pages and reply to comments from the Superset iPhone app.",
		}),
	},
	{
		title: msg({ message: "Pages that save answers" }),
		description: msg({
			message:
				"A page can save each reader's answer, so a poll works with no backend.",
		}),
	},
];
