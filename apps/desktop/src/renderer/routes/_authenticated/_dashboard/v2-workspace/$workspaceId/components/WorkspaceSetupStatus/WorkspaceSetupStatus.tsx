import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceSetupStatus } from "../../hooks/useWorkspaceSetupStatus";

export function WorkspaceSetupStatus({ workspaceId }: { workspaceId: string }) {
	const target = useWorkspaceHostTarget(workspaceId);
	const hostUrl = target.status === "ready" ? target.url : null;
	const navigate = useNavigate();
	const query = useWorkspaceSetupStatus(workspaceId);
	const retry = useMutation({
		mutationFn: (skipFile?: string) =>
			getHostServiceClientByUrl(hostUrl ?? "").workspaceSetup.retry.mutate({
				workspaceId,
				skipFile,
			}),
		onSuccess: () => query.refetch(),
	});
	const state = query.data;
	if (!state || state.status === "ready") return null;
	return (
		<section
			aria-live="polite"
			className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 text-sm"
		>
			<div className="min-w-0 flex-1">
				<p className="font-medium">
					{state.status === "failed" ? (
						<Trans>Workspace setup needs attention</Trans>
					) : state.status === "linking" ? (
						<Trans>Linking shared files…</Trans>
					) : state.status === "launching" ? (
						<Trans>Starting agents…</Trans>
					) : (
						<Trans>Running setup…</Trans>
					)}
				</p>
				{state.error ? (
					<p className="mt-1 break-words text-xs text-muted-foreground">
						{state.failedPath && <code>{state.failedPath}: </code>}
						{state.error}
					</p>
				) : (
					state.pendingAgents > 0 && (
						<p className="mt-1 text-xs text-muted-foreground">
							<Trans>Agents will start when setup finishes.</Trans>
						</p>
					)
				)}
				{retry.error && (
					<p role="alert" className="text-xs text-destructive">
						{retry.error.message}
					</p>
				)}
			</div>
			<div className="flex flex-wrap gap-2">
				{state.terminalId && (
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							void navigate({
								to: "/v2-workspace/$workspaceId",
								params: { workspaceId },
								search: {
									terminalId: state.terminalId,
									focusRequestId: crypto.randomUUID(),
								},
							})
						}
					>
						<Trans>View output</Trans>
					</Button>
				)}
				{state.status === "failed" && (
					<Button
						size="sm"
						disabled={retry.isPending}
						onClick={() => retry.mutate(undefined)}
					>
						<Trans>Retry setup</Trans>
					</Button>
				)}
				{state.status === "failed" && state.failedPath && (
					<Button
						size="sm"
						variant="ghost"
						disabled={retry.isPending}
						onClick={() => retry.mutate(state.failedPath)}
					>
						<Trans>Skip this file once</Trans>
					</Button>
				)}
			</div>
		</section>
	);
}
