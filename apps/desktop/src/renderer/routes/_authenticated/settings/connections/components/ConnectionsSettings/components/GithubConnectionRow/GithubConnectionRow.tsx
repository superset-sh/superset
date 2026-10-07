import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { FaGithub } from "react-icons/fa";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function GithubConnectionRow() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	// The connection lands in the browser; coming back to the window is when
	// it appears, even within the cloud queries' 30s freshness.
	const status = cloudTrpc.githubUser.get.useQuery(undefined, {
		refetchOnWindowFocus: "always",
	});
	const connect = cloudTrpc.githubUser.connect.useMutation({
		onSuccess: ({ url }) => {
			window.open(url, "_blank");
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const disconnect = cloudTrpc.githubUser.disconnect.useMutation({
		onSuccess: async () => {
			await utils.githubUser.get.invalidate();
			toast.success(t({ message: "GitHub disconnected" }));
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const connection = status.data?.connection ?? null;

	return (
		<div className="flex items-center gap-4 px-4 py-4">
			<div className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
				<FaGithub className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">GitHub</div>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">
					{status.isPending ? (
						<Skeleton className="h-3 w-40" />
					) : connection ? (
						<Trans>
							@{connection.login} · cloud workspaces commit, push and open pull
							requests as you
						</Trans>
					) : status.data?.available === false ? (
						<Trans>Not available on this server</Trans>
					) : (
						<Trans>
							Not connected · cloud workspaces push as your organization's
							GitHub App
						</Trans>
					)}
				</div>
			</div>
			{connection ? (
				<Button
					className="text-destructive"
					disabled={disconnect.isPending}
					onClick={() => disconnect.mutate()}
					size="sm"
					variant="outline"
				>
					<Trans>Disconnect</Trans>
				</Button>
			) : (
				<Button
					disabled={
						connect.isPending ||
						status.isPending ||
						status.data?.available === false
					}
					onClick={() => connect.mutate()}
					size="sm"
					variant="outline"
				>
					<Trans>Connect</Trans>
				</Button>
			)}
		</div>
	);
}
