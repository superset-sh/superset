import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { useFramePointerDown } from "@superset/ui/page-comments";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bot, LoaderCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import {
	type PageWatcherRow,
	usePageWatchersForPage,
} from "renderer/hooks/host-service/usePageWatchersForPage";
import {
	type TerminalAgentBinding,
	useTerminalAgentBindings,
} from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	AgentSessionPicker,
	type AgentTarget,
	useAgentSessionTarget,
} from "renderer/routes/_authenticated/_dashboard/components/AgentSessionPicker";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { AgentIcon } from "renderer/routes/_authenticated/settings/agents/components/V2AgentsSettings/components/AgentIcon";
import type { CreateNewAgentSession } from "../../../../../useAgentSessionLauncher";
import { waitForPageAgent } from "./utils/waitForPageAgent";

const WATCHING_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 5 * 60_000;

interface PageWatcherMenuProps {
	workspaceId: string;
	pageId: string | undefined;
	canManage: boolean;
	onCreateNewAgentSession: CreateNewAgentSession;
}

export function PageWatcherMenu({
	workspaceId,
	pageId,
	canManage,
	onCreateNewAgentSession,
}: PageWatcherMenuProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const watchers = usePageWatchersForPage({ pageId, workspaceId });
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const bindings = useTerminalAgentBindings(workspaceId);
	const availableAgents = useMemo(
		() =>
			Array.from(bindings.values())
				.filter(
					(binding) =>
						!watchers.some(
							(watcher) =>
								watcher.hostUrl === hostUrl &&
								watcher.terminalId === binding.terminalId,
						),
				)
				.sort((a, b) => b.lastEventAt - a.lastEventAt),
		[bindings, watchers, hostUrl],
	);
	const { value, resolved, onValueChange } = useAgentSessionTarget({
		sessions: availableAgents,
		configs,
	});
	const queryClient = useQueryClient();
	const cloudUtils = cloudTrpc.useUtils();
	const [menuOpen, setMenuOpen] = useState(false);

	const refreshWatchers = () => {
		void queryClient.invalidateQueries({ queryKey: ["page-watchers-by-host"] });
		void queryClient.invalidateQueries({ queryKey: ["page-watchers"] });
		if (pageId) void cloudUtils.page.get.invalidate({ id: pageId });
	};

	const unwatch = useMutation({
		mutationFn: async (watcher: PageWatcherRow) =>
			await getHostServiceClientByUrl(watcher.hostUrl).pageWatch.unwatch.mutate(
				{ pageId: pageId ?? "" },
			),
		onSettled: refreshWatchers,
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

	const unconfirmedWatch =
		watchers.length === 0 && cloudWatch.data?.watch.watching === true;

	const assign = useMutation({
		mutationFn: async (binding: TerminalAgentBinding) => {
			const page = cloudWatch.data;
			if (!hostUrl || !page || !canManage) return;
			await getHostServiceClientByUrl(hostUrl).pageWatch.assign.mutate({
				pageId: page.id,
				slug: page.slug,
				title: page.title,
				workspaceId,
				terminalId: binding.terminalId,
				agentId: binding.agentId,
			});
		},
		onSuccess: () => setMenuOpen(false),
		onSettled: refreshWatchers,
		onError: (error) =>
			toast.error(t({ message: "Could not add agent" }), {
				description: errorMessage(error),
			}),
	});

	const launch = useMutation({
		mutationFn: async ({
			configId,
			placement,
		}: Extract<AgentTarget, { kind: "new" }>) => {
			const page = cloudWatch.data;
			if (!hostUrl || !page || !canManage) return;
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await onCreateNewAgentSession({
				configId,
				placement,
				prompt: `Watch the Superset Page with ID ${page.id} for reader comments. Read it with superset pages get ${page.id}. Load the Superset Pages skill (superset-page or superset:page) and follow it when handling comments. The app will register this terminal as the page watcher. Do not republish or change the page until a reader requests a change. After reading, wait for comments to be delivered to this session.`,
			});
			if (!result) return;
			const binding = await waitForPageAgent({
				client,
				workspaceId,
				terminalId: result.terminalId,
			});
			if (!binding) throw new Error(t({ message: "Could not start agent" }));
			await client.pageWatch.assign.mutate({
				pageId: page.id,
				slug: page.slug,
				title: page.title,
				workspaceId,
				terminalId: binding.terminalId,
				agentId: binding.agentId,
			});
		},
		onSettled: refreshWatchers,
		onError: (error) =>
			toast.error(t({ message: "Could not add agent" }), {
				description: errorMessage(error),
			}),
	});

	const pending = assign.isPending || launch.isPending || unwatch.isPending;
	const submit = () => {
		if (!resolved || pending || !hostUrl || !cloudWatch.data || !canManage)
			return;
		if (resolved.kind === "new") {
			launch.mutate(resolved);
		} else {
			const binding = bindings.get(resolved.terminalId);
			if (binding) assign.mutate(binding);
		}
	};

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
		<Popover open={menuOpen} onOpenChange={setMenuOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="relative h-6 min-w-6 gap-1 px-1 has-[>svg]:px-1 text-muted-foreground/60 hover:text-muted-foreground"
					aria-label={t({
						message: "Listening agents",
					})}
				>
					<Bot className="size-3.5" />
					{watchers.length > 0 ? (
						<span className="absolute top-0.5 left-3.5 size-1.5 rounded-full bg-amber-500 ring-2 ring-background" />
					) : null}
					{watchers.length > 1 ? (
						<span className="font-medium text-[11px] tabular-nums">
							{watchers.length}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
				<div className="px-3 pt-3 pb-1 text-sm font-medium">
					<Trans>Listening agents</Trans>
				</div>
				<div className="px-3 pb-3 text-muted-foreground text-xs">
					{watchers.length > 0 ? (
						<Plural
							value={Math.max(watchers.length, 1)}
							one="Comments go to this agent"
							other="Comments go to these agents"
						/>
					) : unconfirmedWatch ? (
						<Trans>Listening status unavailable</Trans>
					) : (
						<Trans>No listening agents</Trans>
					)}
				</div>
				<div className="border-t border-border/60" />
				{watchers.map((watcher) => {
					const navigable = watcher.workspaceName !== null;
					return (
						<div
							key={`${watcher.hostId}:${watcher.terminalId}`}
							className="group flex items-center gap-2 px-3 py-1"
						>
							<button
								type="button"
								disabled={!navigable}
								onClick={() => open(watcher)}
								className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left hover:bg-accent disabled:pointer-events-none"
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
							</button>
							<button
								type="button"
								aria-label={t({ message: "Stop watching" })}
								title={t({ message: "Stop watching" })}
								disabled={
									!canManage ||
									launch.isPending ||
									assign.isPending ||
									unwatch.isPending
								}
								className="flex shrink-0 items-center justify-center text-muted-foreground opacity-0 hover:text-foreground disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100"
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									unwatch.mutate(watcher);
								}}
							>
								<HiMiniXMark className="size-3.5" />
							</button>
						</div>
					);
				})}
				{canManage ? (
					<form
						className="border-t border-border/60 bg-muted/30 p-2.5"
						onSubmit={(event) => {
							event.preventDefault();
							submit();
						}}
					>
						<fieldset
							disabled={pending}
							className="flex min-w-0 flex-wrap items-center gap-2"
						>
							<AgentSessionPicker
								workspaceId={workspaceId}
								value={value}
								onValueChange={onValueChange}
								sessions={availableAgents}
								configs={configs}
							/>
							{availableAgents.length === 0 && configs.length === 0 ? (
								<span className="text-xs text-muted-foreground">
									<Trans>No agents yet</Trans>
								</span>
							) : null}
							<Button
								type="submit"
								size="xs"
								className="ml-auto h-7 gap-1.5 px-2.5 text-[11px]"
								disabled={pending || !hostUrl || !cloudWatch.data || !resolved}
							>
								{pending ? (
									<LoaderCircle className="size-3 animate-spin" />
								) : null}
								<Trans>Add listening agent</Trans>
							</Button>
						</fieldset>
					</form>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
