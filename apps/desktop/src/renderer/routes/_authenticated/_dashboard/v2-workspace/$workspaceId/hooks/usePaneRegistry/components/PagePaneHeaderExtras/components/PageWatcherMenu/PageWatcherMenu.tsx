import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useFramePointerDown } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useCallback, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import {
	type PageWatcherRow,
	usePageWatchersForPage,
} from "renderer/hooks/host-service/usePageWatchersForPage";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { AgentIcon } from "renderer/routes/_authenticated/settings/agents/components/V2AgentsSettings/components/AgentIcon";

const WATCHING_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 5 * 60_000;

interface PageWatcherMenuProps {
	workspaceId: string;
	pageId: string | undefined;
}

export function PageWatcherMenu({ workspaceId, pageId }: PageWatcherMenuProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const watchers = usePageWatchersForPage({ pageId, workspaceId });
	const queryClient = useQueryClient();
	const cloudUtils = cloudTrpc.useUtils();
	const [menuOpen, setMenuOpen] = useState(false);

	const unwatch = useMutation({
		mutationFn: async (watcher: PageWatcherRow) =>
			await getHostServiceClientByUrl(watcher.hostUrl).pageWatch.unwatch.mutate(
				{ pageId: pageId ?? "" },
			),
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: ["page-watchers-by-host"],
			});
			if (pageId) void cloudUtils.page.get.invalidate({ id: pageId });
		},
		onError: (error) =>
			toast.error(t({ message: "Could not stop watching" }), {
				description: errorMessage(error),
			}),
	});

	useFramePointerDown(useCallback(() => setMenuOpen(false), []));

	// The page row's own flag is the org-wide answer, and the only thing that
	// knows about a watcher on a host this machine cannot reach.
	const cloudWatch = cloudTrpc.page.get.useQuery(
		{ id: pageId ?? "" },
		{
			enabled: Boolean(pageId),
			refetchInterval: (query) =>
				query.state.data?.watch.watching
					? WATCHING_REFRESH_MS
					: IDLE_REFRESH_MS,
		},
	);

	const watchedElsewhere =
		watchers.length === 0 && cloudWatch.data?.watch.watching === true;

	if (!pageId) return null;
	// Nothing is watching: the header says nothing rather than saying so.
	if (watchers.length === 0 && !watchedElsewhere) return null;

	const open = (watcher: PageWatcherRow) => {
		void navigateToV2Workspace(watcher.workspaceId, navigate, {
			search: {
				terminalId: watcher.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
		setMenuOpen(false);
	};

	return (
		<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="relative h-6 gap-1 px-1.5 text-muted-foreground/60 text-xs hover:text-muted-foreground"
					aria-label={t({
						message: "Agents watching this page for comments",
					})}
				>
					<Bot className="size-4" />
					<span className="absolute top-0.5 left-3.5 size-1.5 rounded-full bg-amber-500 ring-2 ring-background" />
					{watchers.length > 1 ? <span>{watchers.length}</span> : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					<Plural
						value={Math.max(watchers.length, 1)}
						one="Comments go to this agent"
						other="Comments go to these agents"
					/>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{watchedElsewhere ? (
					<DropdownMenuItem disabled className="gap-2">
						<AgentIcon
							presetId={cloudWatch.data?.watch.agentId ?? ""}
							className="size-4"
						/>
						<span className="truncate text-sm">
							{cloudWatch.data?.watch.agentId ??
								t({
									message: "An agent",
									context: "page watcher with no known name",
								})}
						</span>
						<span className="ml-auto shrink-0 text-muted-foreground text-xs">
							<Trans>On a host you can't reach</Trans>
						</span>
					</DropdownMenuItem>
				) : (
					watchers.map((watcher) => {
						const navigable = watcher.workspaceName !== null;
						return (
							<DropdownMenuItem
								key={`${watcher.hostId}:${watcher.terminalId}`}
								onSelect={
									navigable
										? () => open(watcher)
										: (event) => event.preventDefault()
								}
								className="group gap-2"
							>
								<AgentIcon
									presetId={watcher.agentId ?? ""}
									className="size-4"
								/>
								<span className="min-w-0 flex-1 truncate text-sm">
									{watcher.sessionTitle ??
										watcher.agentId ??
										watcher.terminalId.slice(0, 8)}
								</span>
								<span className="max-w-[50%] shrink-0 truncate text-muted-foreground text-xs">
									{watcher.workspaceName}
								</span>
								<button
									type="button"
									aria-label={t({ message: "Stop watching" })}
									title={t({ message: "Stop watching" })}
									disabled={
										unwatch.isPending &&
										unwatch.variables?.terminalId === watcher.terminalId
									}
									className="flex shrink-0 items-center justify-center text-muted-foreground opacity-0 hover:text-foreground disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100 group-focus:opacity-100"
									onClick={(event) => {
										event.preventDefault();
										event.stopPropagation();
										unwatch.mutate(watcher);
									}}
								>
									<HiMiniXMark className="size-3.5" />
								</button>
							</DropdownMenuItem>
						);
					})
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
