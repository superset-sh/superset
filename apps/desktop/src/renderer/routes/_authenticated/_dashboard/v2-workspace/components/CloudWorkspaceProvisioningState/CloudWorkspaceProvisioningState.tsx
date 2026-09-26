import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Cloud } from "lucide-react";
import { useEffect, useState } from "react";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * A warm sandbox is up in a second or two; the first ones after an image
 * rebuild pull the image and take tens of seconds. Past this, it is more
 * likely stuck than slow.
 */
const STUCK_AFTER_SECONDS = 45;

interface CloudWorkspaceProvisioningStateProps {
	workspaceId: string;
	name: string;
	status: CloudWorkspaceRow["status"];
	createdAt: Date;
}

/**
 * A cloud workspace while its sandbox is being made, or after that failed.
 * The route navigates here the moment the row exists, so this screen — not a
 * toast — is where the wait is visible.
 */
export function CloudWorkspaceProvisioningState({
	workspaceId,
	name,
	status,
	createdAt,
}: CloudWorkspaceProvisioningStateProps) {
	const { t } = useLingui();
	const elapsed = useElapsedSeconds(createdAt.getTime());

	if (status === "failed") {
		return <CloudWorkspaceFailedState workspaceId={workspaceId} name={name} />;
	}

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div
				className="flex w-full max-w-sm flex-col items-start gap-5"
				aria-live="polite"
			>
				<Cloud
					className="size-5 text-muted-foreground"
					strokeWidth={1.5}
					aria-hidden="true"
				/>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						<Trans>Starting cloud workspace</Trans>
					</h1>
					<p className="truncate text-[13px] leading-relaxed text-muted-foreground">
						{name ||
							t({
								message: "Untitled workspace",
							})}
					</p>
				</div>

				<span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
					{formatElapsed(elapsed)}
				</span>

				{elapsed >= STUCK_AFTER_SECONDS && (
					<div className="flex w-full flex-col gap-2 border-t border-border/60 pt-4 animate-in fade-in slide-in-from-bottom-1 duration-500">
						<p className="select-text cursor-text text-[12px] leading-relaxed text-muted-foreground">
							<Trans>
								This is taking longer than usual. The sandbox may still be
								pulling its image — it keeps going whether this window is open
								or not.
							</Trans>
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Provisioning gave up. The row is all that is left of the workspace — the
 * sandbox behind it was torn down when it failed — so the only thing to offer
 * is disposing of it, which is also the only way to clear it from the sidebar.
 */
function CloudWorkspaceFailedState({
	workspaceId,
	name,
}: {
	workspaceId: string;
	name: string;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await apiTrpcClient.cloudWorkspace.delete.mutate({ id: workspaceId });
			await utils.cloudWorkspace.list.invalidate();
			await navigate({ to: "/v2-workspaces" });
		} catch (error) {
			console.error("[cloud-workspace] failed to delete", error);
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div
				role="alert"
				aria-live="assertive"
				className="flex w-full max-w-sm flex-col items-start gap-5"
			>
				<AlertCircle
					className="size-5 text-destructive"
					strokeWidth={1.5}
					aria-hidden="true"
				/>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						<Trans>Couldn't start cloud workspace</Trans>
					</h1>
					<p className="truncate text-[13px] leading-relaxed text-muted-foreground">
						{name ||
							t({
								message: "Untitled workspace",
							})}
					</p>
				</div>

				<div className="w-full rounded-md border border-destructive/20 bg-destructive/[0.04] px-3 py-2.5">
					<p className="select-text cursor-text text-[12px] leading-relaxed text-destructive/90">
						<Trans>
							Provisioning failed and the sandbox was torn down. Nothing is
							running, and this workspace can't be opened — create a new one to
							try again.
						</Trans>
					</p>
				</div>

				<Button
					size="sm"
					variant="outline"
					disabled={isDeleting}
					onClick={() => void handleDelete()}
				>
					{isDeleting
						? t({
								message: "Removing…",
							})
						: t({
								message: "Remove workspace",
							})}
				</Button>
			</div>
		</div>
	);
}

function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(total / 60);
	return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
}

function useElapsedSeconds(since: number): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(id);
	}, []);
	return (now - since) / 1000;
}
