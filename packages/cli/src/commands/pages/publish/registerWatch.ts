import { getHostId } from "@superset/shared/host-info";
import { resolveHostTarget } from "../../../lib/host-target";

export function watchTerminalId(): string | undefined {
	return process.env.SUPERSET_TERMINAL_ID;
}

export async function registerWatch({
	pageId,
	slug,
	title,
	workspaceId,
	terminalId,
	organizationId,
	userJwt,
	api,
}: {
	pageId: string;
	slug: string;
	title: string;
	workspaceId: string;
	terminalId: string;
	organizationId: string;
	userJwt: string;
	api: Parameters<typeof resolveHostTarget>[0]["api"];
}): Promise<void> {
	const target = await resolveHostTarget({
		requestedHostId: getHostId(),
		organizationId,
		userJwt,
		api,
	});
	await target.client.pageWatch.assign.mutate({
		pageId,
		slug,
		title,
		workspaceId,
		terminalId,
		agentId: process.env.SUPERSET_AGENT_ID ?? null,
	});
}
