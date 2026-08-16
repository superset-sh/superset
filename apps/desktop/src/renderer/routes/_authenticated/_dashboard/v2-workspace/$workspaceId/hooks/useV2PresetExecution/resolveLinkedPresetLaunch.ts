import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export async function resolveLinkedPresetLaunchCommand({
	hostUrl,
	agentId,
}: {
	hostUrl: string | null;
	agentId: string;
}): Promise<string> {
	if (!hostUrl) {
		throw new Error("Workspace host is not ready");
	}
	const result = await getHostServiceClientByUrl(
		hostUrl,
	).agents.resolveLaunchCommand.mutate({
		agent: agentId,
	});
	return result.command;
}
