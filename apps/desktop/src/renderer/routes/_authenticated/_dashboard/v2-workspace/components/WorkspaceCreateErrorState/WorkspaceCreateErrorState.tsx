import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, GitBranch } from "lucide-react";
import { useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { FailedWorkspaceCreateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

interface WorkspaceCreateErrorStateProps {
	entry: FailedWorkspaceCreateRow;
}

export function WorkspaceCreateErrorState({
	entry,
}: WorkspaceCreateErrorStateProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const collections = useCollections();
	const { submit } = useWorkspaceCreates();

	const name = entry.input.name;
	const branch = "branch" in entry.input ? entry.input.branch : undefined;

	const [base, setBase] = useState("");
	const recovery = entry.baseRefRecovery;
	const handleRetry = (useCached = false) => {
		const { workspaceId, completed } = submit({
			hostId: entry.hostId,
			snapshot:
				entry.input.projectId === null
					? entry.input
					: {
							...entry.input,
							...(base.trim() && { baseBranch: base.trim() }),
							cachedBase:
								useCached && recovery?.commit
									? { ref: recovery.ref, commit: recovery.commit }
									: undefined,
						},
		});
		void completed.then((outcome) => {
			if (outcome.ok && outcome.workspaceId !== workspaceId) {
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: outcome.workspaceId },
					replace: true,
				});
			}
		});
	};

	const handleDismiss = () => {
		if (collections.failedWorkspaceCreates.get(entry.id)) {
			collections.failedWorkspaceCreates.delete(entry.id);
		}
		void navigate({ to: "/v2-workspaces" });
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
						<Trans>Couldn't create workspace</Trans>
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
					<p className="select-text font-mono text-[11px] leading-relaxed text-destructive/90 break-words whitespace-pre-wrap cursor-text">
						{entry.error}
					</p>
				</div>

				{recovery && (
					<div className="w-full space-y-3">
						<label htmlFor="recovery-base" className="block space-y-2 text-sm">
							<span>
								<Trans>Change base branch</Trans>
							</span>
							<Input
								id="recovery-base"
								value={base}
								onChange={(event) => setBase(event.target.value)}
								placeholder="origin/main"
							/>
						</label>
						{recovery.commit && (
							<details className="text-xs text-muted-foreground">
								<summary className="cursor-pointer">
									<Trans>Use cached base</Trans>
								</summary>
								<p className="my-2 break-all">
									{recovery.ref} · {recovery.commit.slice(0, 8)}
									{recovery.commitTime && (
										<> · {formatDateTime(recovery.commitTime)}</>
									)}
								</p>
								<p className="mb-2">
									<Trans>
										This commit may be behind the remote. Use it for this
										workspace only.
									</Trans>
								</p>
								<Button
									size="sm"
									variant="outline"
									disabled={Boolean(base.trim())}
									onClick={() => handleRetry(true)}
								>
									<Trans>Create from this commit</Trans>
								</Button>
							</details>
						)}
					</div>
				)}
				<div className="flex items-center gap-2">
					<Button size="sm" onClick={() => handleRetry()}>
						<Trans>Try again</Trans>
					</Button>
					<Button size="sm" variant="ghost" onClick={handleDismiss}>
						<Trans>Dismiss</Trans>
					</Button>
				</div>
			</div>
		</div>
	);
}
