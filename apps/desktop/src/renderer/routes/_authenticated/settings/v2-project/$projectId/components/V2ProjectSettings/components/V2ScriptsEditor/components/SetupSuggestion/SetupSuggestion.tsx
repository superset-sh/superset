import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function SetupSuggestion({
	hostUrl,
	projectId,
	onAccept,
}: {
	hostUrl: string;
	projectId: string;
	onAccept: (command: string) => void;
}) {
	const client = getHostServiceClientByUrl(hostUrl);
	const query = useQuery({
		queryKey: ["workspace-setup-project", hostUrl, projectId],
		queryFn: () => client.workspaceSetup.getProject.query({ projectId }),
	});
	const dismiss = useMutation({
		mutationFn: (suggestionDismissed: boolean) =>
			client.workspaceSetup.updateProject.mutate({
				projectId,
				suggestionDismissed,
			}),
		onSuccess: () => query.refetch(),
	});
	if (!query.data?.suggestion) return null;
	if (query.data.suggestionDismissed)
		return (
			<Button
				size="sm"
				variant="link"
				disabled={dismiss.isPending}
				onClick={() => dismiss.mutate(false)}
			>
				<Trans>Show setup suggestion</Trans>
			</Button>
		);
	return (
		<div className="space-y-2 rounded-md border border-border p-3 text-sm">
			<p>
				<Trans>Detected setup command</Trans>
			</p>
			<code>{query.data.suggestion}</code>
			<div className="flex gap-2">
				<Button
					size="sm"
					variant="secondary"
					onClick={() => {
						if (query.data?.suggestion) onAccept(query.data.suggestion);
					}}
				>
					<Trans>Use command</Trans>
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={dismiss.isPending}
					onClick={() => dismiss.mutate(true)}
				>
					<Trans>Dismiss</Trans>
				</Button>
			</div>
			{dismiss.error && (
				<p role="alert" className="text-destructive">
					{dismiss.error.message}
				</p>
			)}
		</div>
	);
}
