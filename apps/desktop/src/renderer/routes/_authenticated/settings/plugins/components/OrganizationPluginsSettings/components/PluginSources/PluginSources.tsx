import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { LuPlus, LuRefreshCw, LuTrash2 } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { AddPluginSourceDialog } from "renderer/routes/_authenticated/components/AddPluginSourceDialog";

export function PluginSources() {
	const { t } = useLingui();
	const { formatRelativeTime } = useFormat();
	const utils = cloudTrpc.useUtils();
	const [isAddOpen, setIsAddOpen] = useState(false);
	const { data: sources, isPending } =
		cloudTrpc.plugins.organization.sources.list.useQuery();

	const refresh = () =>
		Promise.all([
			utils.plugins.organization.sources.list.invalidate(),
			utils.plugins.organization.list.invalidate(),
			utils.plugins.list.invalidate(),
		]);

	const syncMutation = cloudTrpc.plugins.organization.sources.sync.useMutation({
		onSuccess: () => {
			toast.success(t({ message: "Sync requested" }), {
				description: t({
					message: "Plugins update when the sync finishes.",
				}),
			});
		},
		onError: (error) => {
			toast.error(t({ message: "Could not sync" }), {
				description: errorMessage(error),
			});
		},
		onSettled: refresh,
	});

	const removeMutation =
		cloudTrpc.plugins.organization.sources.remove.useMutation({
			onSuccess: () => {
				toast.success(t({ message: "Repository removed" }));
			},
			onError: (error) => {
				toast.error(t({ message: "Could not remove repository" }), {
					description: errorMessage(error),
				});
			},
			onSettled: refresh,
		});

	const confirmRemove = (id: string, repo: string) => {
		alert({
			title: t({ message: "Remove repository" }),
			description: t({
				message: `Remove ${repo}? Every plugin synced from it is removed from your organization.`,
			}),
			actions: [
				{ label: t({ message: "Cancel" }), variant: "outline" },
				{
					label: t({ message: "Remove" }),
					variant: "destructive",
					onClick: () => removeMutation.mutate({ id }),
				},
			],
		});
	};

	return (
		<section className="space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold">
						<Trans>Sources</Trans>
					</h3>
					<p className="text-sm text-muted-foreground mt-1">
						<Trans>
							GitHub repositories with a plugin marketplace file. Superset syncs
							their plugins into your organization.
						</Trans>
					</p>
				</div>
				<Button
					size="sm"
					className="gap-2 shrink-0"
					onClick={() => setIsAddOpen(true)}
				>
					<LuPlus className="size-4" />
					<Trans>Add repository</Trans>
				</Button>
			</div>

			{isPending ? (
				<div className="divide-y divide-border">
					{[1, 2].map((i) => (
						<div key={i} className="flex items-center gap-4 py-3">
							<Skeleton className="size-4 rounded" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-48" />
								<Skeleton className="h-3 w-32" />
							</div>
						</div>
					))}
				</div>
			) : !sources?.length ? (
				<div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
					<Trans>No repositories yet.</Trans>
				</div>
			) : (
				<div className="divide-y divide-border">
					{sources.map((source) => {
						const errors = source.syncError?.split("\n").filter(Boolean) ?? [];
						const ref = source.ref ?? t({ message: "Default branch" });
						const path = source.path || "/";
						const syncedAgo = source.syncedAt
							? formatRelativeTime(new Date(source.syncedAt))
							: null;
						return (
							<div key={source.id} className="flex items-start gap-3 py-3">
								<FaGithub className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium">
										{source.repo}
									</div>
									<div className="mt-0.5 truncate text-xs text-muted-foreground">
										<Trans>
											Ref {ref} · Path {path}
										</Trans>
										{" · "}
										{syncedAgo ? (
											<Trans>Synced {syncedAgo}</Trans>
										) : (
											<Trans>Not synced yet</Trans>
										)}
									</div>
									{errors.length > 0 && (
										<ul className="mt-2 space-y-0.5 text-xs text-destructive">
											{errors.map((line) => (
												<li key={line} className="break-words">
													{line}
												</li>
											))}
										</ul>
									)}
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										variant="ghost"
										size="sm"
										className="gap-1.5"
										disabled={syncMutation.isPending}
										onClick={() => syncMutation.mutate({ id: source.id })}
									>
										<LuRefreshCw
											className={
												syncMutation.isPending &&
												syncMutation.variables?.id === source.id
													? "size-3.5 animate-spin"
													: "size-3.5"
											}
										/>
										<Trans>Sync now</Trans>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 text-muted-foreground hover:text-destructive"
										disabled={removeMutation.isPending}
										aria-label={t({ message: `Remove ${source.repo}` })}
										onClick={() => confirmRemove(source.id, source.repo)}
									>
										<LuTrash2 className="size-4" />
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			<AddPluginSourceDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
		</section>
	);
}
