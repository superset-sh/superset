import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { OpenInMenuButton } from "../OpenInMenuButton";

interface V2OpenInMenuButtonProps {
	branch: string;
	hostUrl: string;
	projectId: string;
	workspaceId: string;
}

export function V2OpenInMenuButton({
	branch,
	hostUrl,
	projectId,
	workspaceId,
}: V2OpenInMenuButtonProps) {
	const workspaceQuery = useQuery({
		queryKey: ["v2-open-in-workspace", hostUrl, workspaceId],
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).workspace.get.query({
				id: workspaceId,
			}),
	});

	if (!workspaceQuery.data?.worktreePath) {
		return null;
	}

	return (
		<OpenInMenuButton
			branch={branch}
			projectId={projectId}
			worktreePath={workspaceQuery.data.worktreePath}
		/>
	);
}
