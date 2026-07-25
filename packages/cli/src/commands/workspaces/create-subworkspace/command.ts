import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveLocalWorkspaceTarget } from "../../../lib/host-target";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description:
		"Create a subworkspace that shares its parent workspace's working tree and branch",
	skipMiddleware: true,
	options: {
		parent: string().desc(
			"Parent workspace UUID (defaults to $SUPERSET_WORKSPACE_ID)",
		),
		name: string().required().desc("Subworkspace display name"),
		agent: string()
			.required()
			.desc(
				"Agent preset id (`claude`, `codex`, …), HostAgentConfig instance UUID, or `superset`",
			),
		prompt: string().required().desc("Initial prompt the subagent starts with"),
		delegationMode: string()
			.enum("native", "workspaces")
			.desc(
				"How further delegated subagents run: native/headless or visible Superset subworkspaces",
			),
		attachment: string()
			.variadic()
			.desc("Local file path to upload as an attachment. Repeatable"),
	},
	/** Create the logical child through the host that owns its parent. */
	run: async ({ options }) => {
		const parentWorkspaceId =
			options.parent ?? process.env.SUPERSET_WORKSPACE_ID;
		if (!parentWorkspaceId) {
			throw new CLIError(
				"No parent workspace id",
				"Pass --parent <id> or run inside a Superset workspace terminal.",
			);
		}
		const target = await resolveLocalWorkspaceTarget(parentWorkspaceId);
		const attachmentIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];

		const result = await target.client.workspaces.createSubworkspace.mutate({
			parentWorkspaceId,
			name: options.name,
			agent: {
				agent: options.agent,
				prompt: options.prompt,
				delegationMode: options.delegationMode,
				attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
			},
		});

		return {
			data: result,
			message: result.alreadyExists
				? `Reused subworkspace "${result.workspace.name}" on host ${target.hostId}`
				: `Created subworkspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
