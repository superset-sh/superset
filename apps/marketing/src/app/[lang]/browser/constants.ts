import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type BrowserStepId = "open" | "pick" | "describe" | "verify";

interface BrowserItem {
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const BROWSER_STEPS: (BrowserItem & { id: BrowserStepId })[] = [
	{
		id: "open",
		title: msg({ message: "Open your app." }),
		description: msg({
			message:
				"Press ⌘⇧B or open a port Superset detected. Your dev server loads in a pane beside your terminals.",
		}),
	},
	{
		id: "pick",
		title: msg({ message: "Click an element." }),
		description: msg({
			message:
				"Turn on Design and click the part of the page you want to change.",
		}),
	},
	{
		id: "describe",
		title: msg({ message: "Describe the change." }),
		description: msg({
			message:
				"Write a note and pick an agent. Your note arrives with the element's code and a cropped screenshot.",
		}),
	},
	{
		id: "verify",
		title: msg({ message: "Let the agent drive." }),
		description: msg({
			message:
				"The agent clicks and types in the same pane to test the change. You watch it happen.",
		}),
	},
];

export const FEATURES: BrowserItem[] = [
	{
		title: msg({ message: "DevTools beside the page" }),
		description: msg({
			message: "Open DevTools in a pane next to any tab to debug the page.",
		}),
	},
	{
		title: msg({ message: "Your signed-in session" }),
		description: msg({
			message:
				"The pane uses your real logins. Agents ask you before they take a consequential action.",
		}),
	},
	{
		title: msg({ message: "A CDP endpoint per pane" }),
		description: msg({
			message:
				"superset browser cdp prints an endpoint for that pane only. Point Playwright or browser-use at it.",
		}),
	},
	{
		title: msg({ message: "Ports on remote hosts" }),
		description: msg({
			message:
				"Superset forwards the ports a remote workspace opens while you have it selected.",
		}),
	},
];
