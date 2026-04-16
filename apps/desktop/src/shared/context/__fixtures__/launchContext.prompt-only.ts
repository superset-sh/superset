import type { LaunchContext, LaunchSource } from "../types";

const sources: LaunchSource[] = [
	{
		kind: "user-prompt",
		content: [{ type: "text", text: "refactor the auth middleware" }],
	},
];

export const launchContextPromptOnly: LaunchContext = {
	projectId: "project-1",
	sources,
	sections: [
		{
			id: "user-prompt",
			kind: "user-prompt",
			label: "Prompt",
			content: [{ type: "text", text: "refactor the auth middleware" }],
		},
	],
	failures: [],
	taskSlug: undefined,
	agent: { id: "claude", config: undefined },
};
