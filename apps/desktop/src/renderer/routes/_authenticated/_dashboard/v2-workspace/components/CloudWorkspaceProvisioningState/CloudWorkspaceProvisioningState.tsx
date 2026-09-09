import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Check, Cloud, GitBranch, Loader2 } from "lucide-react";
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
	branch: string;
	status: CloudWorkspaceRow["status"];
}

/**
 * What a cloud workspace shows between "created" and "openable".
 *
 * The route navigates here the moment the row exists, so this screen — not a
 * toast, and not the host-unreachable takeover — is where the sandbox coming
 * up is visible. Its steps are read off the row's status and the host fan-out
 * rather than a timer, so they can't claim progress that hasn't happened.
 */
export function CloudWorkspaceProvisioningState({
	workspaceId,
	name,
	branch,
	status,
}: CloudWorkspaceProvisioningStateProps) {
	const { t } = useLingui();
	const elapsed = useElapsedSeconds();

	if (status === "failed") {
		return (
			<CloudWorkspaceFailedState
				workspaceId={workspaceId}
				name={name}
				branch={branch}
			/>
		);
	}

	// `ready` means the provider handed back a preview URL, which is a step
	// short of host-service answering on it. Until the workspace shows up in
	// the fan-out this route keeps rendering, so the second step is the honest
	// place to be.
	const sandboxReady = status !== "provisioning";

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

				{branch && (
					<div className="flex w-full items-center gap-2">
						<GitBranch
							className="size-3 shrink-0 text-muted-foreground/80"
							strokeWidth={2}
							aria-hidden="true"
						/>
						<code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
							{branch}
						</code>
					</div>
				)}

				<ul className="flex w-full flex-col gap-2">
					<StepRow
						label={t({
							message: "Creating sandbox",
						})}
						state={sandboxReady ? "done" : "active"}
					/>
					<StepRow
						label={t({
							message: "Connecting to the workspace",
						})}
						state={sandboxReady ? "active" : "pending"}
					/>
				</ul>

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
	branch,
}: {
	workspaceId: string;
	name: string;
	branch: string;
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

				{branch && (
					<div className="flex w-full items-center gap-2">
						<GitBranch
							className="size-3 shrink-0 text-muted-foreground/80"
							strokeWidth={2}
							aria-hidden="true"
						/>
						<code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
							{branch}
						</code>
					</div>
				)}

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

type StepState = "done" | "active" | "pending";

function StepRow({ label, state }: { label: string; state: StepState }) {
	return (
		<li
			className={cn(
				"flex items-center gap-2.5 text-[13px] leading-tight transition-colors duration-300",
				state === "done" && "text-foreground/80",
				state === "active" && "text-foreground",
				state === "pending" && "text-muted-foreground/55",
			)}
		>
			<StepIcon state={state} />
			<span>{label}</span>
		</li>
	);
}

function StepIcon({ state }: { state: StepState }) {
	if (state === "done") {
		return (
			<span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-foreground/85 text-background">
				<Check className="size-2" strokeWidth={3.5} aria-hidden="true" />
			</span>
		);
	}
	if (state === "active") {
		return (
			<Loader2
				className="size-3.5 shrink-0 animate-spin text-foreground/70"
				strokeWidth={2}
				aria-hidden="true"
			/>
		);
	}
	return (
		<span className="grid size-3.5 shrink-0 place-items-center">
			<span className="size-1.5 rounded-full bg-muted-foreground/35" />
		</span>
	);
}

function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(total / 60);
	return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
}

/**
 * Counts from when this screen appeared, not from the row's `createdAt`: an
 * hours-old cloud workspace renders this too while its sleeping sandbox wakes,
 * and "1:47:12" would be describing the workspace's age, not the wait.
 */
function useElapsedSeconds(): number {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const startedAt = Date.now();
		const id = window.setInterval(
			() => setElapsed((Date.now() - startedAt) / 1000),
			250,
		);
		return () => window.clearInterval(id);
	}, []);
	return elapsed;
}
