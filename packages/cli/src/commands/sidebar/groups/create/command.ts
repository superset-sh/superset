import { randomUUID } from "node:crypto";
import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	executeSidebarCommand,
	getLocalResourceClient,
	resolveProject,
} from "../../shared";

export default command({
	description: "Create a named group in a project's sidebar section",
	args: [positional("name").required().desc("Group name")],
	options: {
		project: string().required().desc("Project name or ID"),
	},
	run: async ({ ctx, args, options }) => {
		const projects = await getLocalResourceClient(ctx).project.list.query();
		const project = resolveProject(projects, options.project);
		const groupId = randomUUID();
		const state = await executeSidebarCommand(ctx, {
			action: "create-group",
			groupId,
			projectId: project.id,
			name: args.name as string,
		});
		return {
			data: { groupId, projectId: project.id, state },
			message: `Created sidebar group "${args.name}" (${groupId})`,
		};
	},
});
