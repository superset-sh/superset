import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type RunStepId = "write" | "schedule" | "run" | "review";

interface AutomationsItem {
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const RUN_STEPS: (AutomationsItem & { id: RunStepId })[] = [
	{
		id: "write",
		title: msg({ message: "Write." }),
		description: msg({
			message:
				"Write the prompt and pick the agent. Choose a project to work in, or run without one.",
		}),
	},
	{
		id: "schedule",
		title: msg({ message: "Schedule." }),
		description: msg({
			message:
				"Choose a preset such as Weekdays or write a custom RRule. One automation can have more than one schedule.",
		}),
	},
	{
		id: "run",
		title: msg({ message: "Run." }),
		description: msg({
			message:
				"At each scheduled time, the device you picked creates a new workspace. The agent starts on your prompt there.",
		}),
	},
	{
		id: "review",
		title: msg({ message: "Review." }),
		description: msg({
			message:
				"Open the run from Run History to see what the agent did. Reply in the same session to keep going.",
		}),
	},
];

export const DETAILS: AutomationsItem[] = [
	{
		title: msg({ message: "Runs on a device you choose" }),
		description: msg({
			message:
				"Each automation runs on the machine you pick. If it is offline, the run fails and Retry all sends it again.",
		}),
	},
	{
		title: msg({ message: "Works with your agents" }),
		description: msg({
			message: "Run any agent you set up in Superset, such as Claude or Codex.",
		}),
	},
	{
		title: msg({ message: "Scriptable from the CLI" }),
		description: msg({
			message:
				"Use superset automations to create and run automations from a script or from another agent.",
		}),
	},
	{
		title: msg({ message: "Part of Superset Pro" }),
		description: msg({
			message:
				"Automations need a Pro or Enterprise plan. If you downgrade, your automations stay but stop running.",
		}),
	},
];
