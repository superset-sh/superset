import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function WorkspaceSetupSummary({
	hostUrl,
	projectId,
}: {
	hostUrl: string | null;
	projectId: string | null;
}) {
	const query = useQuery({
		queryKey: ["workspace-setup-project", hostUrl, projectId],
		enabled: Boolean(hostUrl && projectId),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl ?? "").workspaceSetup.getProject.query({
				projectId: projectId ?? "",
			}),
		retry: false,
	});
	if (!query.data) return null;
	return (
		<details className="px-3 pb-3 text-xs text-muted-foreground">
			<summary className="cursor-pointer">
				<Trans>Workspace setup</Trans>
			</summary>
			<div className="mt-2 space-y-1">
				<p>
					<Trans>Remote base → shared files → setup → ready</Trans>
				</p>
				{query.data.setupCommand && (
					<p className="break-all font-mono">{query.data.setupCommand}</p>
				)}
				{query.data.sharedFilePaths.length > 0 && (
					<p className="break-all font-mono">
						{query.data.sharedFilePaths.join(", ")}
					</p>
				)}
			</div>
		</details>
	);
}
