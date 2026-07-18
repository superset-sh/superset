import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	applyProjectLaneOrder,
	buildProjectLane,
	moveLaneItem,
	requireSingleMoveTarget,
	resolveProjectId,
	resolveSection,
	toMoveTarget,
} from "../../../../lib/host-sections";
import {
	requireHostTarget,
	resolveHostTarget,
} from "../../../../lib/host-target";

export default command({
	description: "Move a workspace group within its project's sidebar order",
	args: [positional("group").required().desc("Group name or id")],
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string().desc(
			"Scope group-name resolution to a project (name or id)",
		),
		up: boolean().desc("Move one position up"),
		down: boolean().desc("Move one position down"),
		top: boolean().desc("Move to the top"),
		bottom: boolean().desc("Move to the bottom"),
		after: string().desc("Place directly under this group (name or id)"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		requireSingleMoveTarget(toMoveTarget(options, options.after ?? undefined));

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const projectId = options.project
			? await resolveProjectId(ctx, organizationId, options.project)
			: undefined;
		const section = await resolveSection(
			target.client,
			args.group as string,
			projectId,
		);
		const afterSection = options.after
			? await resolveSection(target.client, options.after, section.projectId)
			: undefined;
		if (afterSection && afterSection.projectId !== section.projectId) {
			throw new CLIError("--after group belongs to a different project");
		}

		const [hostWorkspaces, hostSections] = await Promise.all([
			target.client.workspace.list.query(),
			target.client.sections.list.query(),
		]);
		const lane = buildProjectLane(
			hostWorkspaces,
			hostSections,
			section.projectId,
		);
		const reordered = moveLaneItem(
			lane,
			section.id,
			toMoveTarget(options, afterSection?.id),
		);
		await applyProjectLaneOrder(target.client, reordered);

		return {
			data: { id: section.id },
			message: `Moved group "${section.name}"`,
		};
	},
});
