import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const CONNECT_POLL_MS = 2_000;
const CONNECT_WAIT_MS = 5 * 60_000;

/** A person's own accounts, as opposed to the organization's integrations. */
export function ConnectionsSettings() {
	return (
		<div className="w-full max-w-4xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Connections</Trans>
				</h2>
				<p className="mt-1 max-w-prose text-sm text-muted-foreground">
					<Trans>
						Your own accounts. Your organization's integrations let Superset
						reach its tools; connecting yours makes the work Superset does for
						you show up as you.
					</Trans>
				</p>
			</div>
			<div className="divide-y divide-border rounded-md border border-border">
				<GithubConnectionRow />
			</div>
		</div>
	);
}

function GithubConnectionRow() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	// The flow finishes in the browser, and returning to an Electron window
	// never makes the page "visible" again, so a focus refetch would not fire:
	// poll from the moment Connect is clicked until the connection appears.
	const [waitingSince, setWaitingSince] = useState<number | null>(null);
	const status = cloudTrpc.githubUser.get.useQuery(undefined, {
		refetchInterval: (query) =>
			waitingSince !== null &&
			!query.state.data?.connection &&
			Date.now() - waitingSince < CONNECT_WAIT_MS
				? CONNECT_POLL_MS
				: false,
	});
	const connect = cloudTrpc.githubUser.connect.useMutation({
		onSuccess: ({ url }) => {
			setWaitingSince(Date.now());
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
