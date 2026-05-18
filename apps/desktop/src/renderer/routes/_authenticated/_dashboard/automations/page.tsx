import type {
	SelectAutomation,
	SelectUser,
	SelectV2Host,
	SelectV2Workspace,
} from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { describeSchedule } from "@superset/shared/rrule";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiOutlineComputerDesktop } from "react-icons/hi2";
import {
	LuClock,
	LuEllipsis,
	LuGitBranch,
	LuPencil,
	LuPlay,
	LuPlus,
	LuSearchX,
	LuSparkles,
	LuTerminal,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AgentCell } from "./components/AgentCell";
import { AutomationsEmptyState } from "./components/AutomationsEmptyState";
import { CellWithIcon } from "./components/CellWithIcon";
import { CreateAutomationDialog } from "./components/CreateAutomationDialog";
import { useRecentProjects } from "./hooks/useRecentProjects";
import type { AutomationTemplate } from "./templates";

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

type Scope = "mine" | "team";

const ROW_GRID_MINE =
	"grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] items-center gap-4";

const ROW_GRID_TEAM =
	"grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] items-center gap-4";

function AutomationsPage() {
	const navigate = useNavigate();
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;

	const [createOpen, setCreateOpen] = useState(false);
	const [initialTemplate, setInitialTemplate] =
		useState<AutomationTemplate | null>(null);
	const [scope, setScope] = useState<Scope>("mine");
	const [cliHintDismissed, setCliHintDismissed] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<SelectAutomation | null>(
		null,
	);

	const runNowMutation = useMutation({
		mutationFn: ({ id }: { id: string; name: string }) =>
			apiTrpcClient.automation.runNow.mutate({ id }),
		onSuccess: (_, { name }) => toast.success(`Running "${name}" now`),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to trigger run",
			),
	});

	const deleteMutation = useMutation({
		mutationFn: ({ id }: { id: string; name: string }) =>
			apiTrpcClient.automation.delete.mutate({ id }),
		onSuccess: (_, { name }) => {
			setPendingDelete(null);
			toast.success(`"${name}" deleted`);
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to delete automation",
			),
	});

	const { data: automationRows = [], isReady: automationsReady } = useLiveQuery(
		(q) =>
			q
				.from({ a: collections.automations })
				.orderBy(({ a }) => a.createdAt, "desc")
				.select(({ a }) => ({ ...a })),
		[collections.automations],
	);
	// Live queries can briefly surface nullish rows while syncing.
	const automations = useMemo(
		() => automationRows.filter((automation) => automation != null),
		[automationRows],
	);

	const { data: userRows = [] } = useLiveQuery(
		(q) =>
			q.from({ u: collections.users }).select(({ u }) => ({
				id: u.id,
				name: u.name,
				email: u.email,
			})),
		[collections.users],
	);
	const recentProjects = useRecentProjects();
	const { data: workspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ w: collections.v2Workspaces })
				.select(({ w }) => ({ id: w.id, name: w.name })),
		[collections.v2Workspaces],
	);
	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ h: collections.v2Hosts })
				.select(({ h }) => ({ machineId: h.machineId, name: h.name })),
		[collections.v2Hosts],
	);

	// Live queries can briefly surface nullish rows while syncing (see #4519).
	const usersById = useMemo(
		() =>
			new Map(
				(userRows as Pick<SelectUser, "id" | "name" | "email">[])
					.filter((u) => u != null)
					.map((u) => [u.id, u]),
			),
		[userRows],
	);
	const projectsById = useMemo(
		() =>
			new Map(recentProjects.filter((p) => p != null).map((p) => [p.id, p])),
		[recentProjects],
	);
	const workspacesById = useMemo(
		() =>
			new Map(
				(workspaceRows as Pick<SelectV2Workspace, "id" | "name">[])
					.filter((w) => w != null)
					.map((w) => [w.id, w]),
			),
		[workspaceRows],
	);
	const hostsById = useMemo(
		() =>
			new Map(
				(hostRows as Pick<SelectV2Host, "machineId" | "name">[])
					.filter((h) => h != null)
					.map((h) => [h.machineId, h]),
			),
		[hostRows],
	);

	const mineCount = useMemo(
		() =>
			currentUserId
				? automations.filter((a) => a.ownerUserId === currentUserId).length
				: 0,
		[automations, currentUserId],
	);
	const teamCount = automations.length - mineCount;

	const visible = useMemo(() => {
		if (!currentUserId) return automations;
		return scope === "mine"
			? automations.filter((a) => a.ownerUserId === currentUserId)
			: automations.filter((a) => a.ownerUserId !== currentUserId);
	}, [automations, scope, currentUserId]);

	const handleSelectTemplate = (template: AutomationTemplate) => {
		setInitialTemplate(template);
		setCreateOpen(true);
	};

	const handleDialogOpenChange = (next: boolean) => {
		setCreateOpen(next);
		if (!next) setInitialTemplate(null);
	};

	const rowGrid = scope === "team" ? ROW_GRID_TEAM : ROW_GRID_MINE;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<div className="flex items-center gap-3">
					<h1 className="text-sm font-semibold tracking-tight">Automations</h1>
					<div className="h-4 w-px bg-border" />
					<Tabs
						value={scope}
						onValueChange={(value) => {
							if (value) setScope(value as Scope);
						}}
					>
						<TabsList className="h-8 bg-transparent p-0 gap-1">
							<TabsTrigger
								value="mine"
								className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
							>
								<span className="text-sm">Mine</span>
								<span className="ml-1 tabular-nums text-xs text-muted-foreground">
									{mineCount}
								</span>
							</TabsTrigger>
							<TabsTrigger
								value="team"
								className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
							>
								<span className="text-sm">Team</span>
								<span className="ml-1 tabular-nums text-xs text-muted-foreground">
									{teamCount}
								</span>
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				<div className="flex items-center gap-2">
					<Button
						asChild
						variant="ghost"
						size="sm"
						className="h-8 text-muted-foreground"
					>
						<a
							href={`${COMPANY.DOCS_URL}/automations`}
							target="_blank"
							rel="noreferrer"
						>
							Learn more
						</a>
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 px-3"
						onClick={() => setCreateOpen(true)}
					>
						<LuPlus className="size-4" />
						<span>New automation</span>
					</Button>
				</div>
			</header>

			{!cliHintDismissed && (
				<div className="shrink-0 px-4 pt-3">
					<div className="relative flex items-start gap-3 rounded-lg border border-border bg-gradient-to-b from-accent/40 to-accent/10 py-3 pl-3.5 pr-10">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm">
							<LuTerminal className="size-4" />
						</div>
						<div className="min-w-0 space-y-1">
							<p className="text-sm font-medium text-foreground">
								Supercharge automations with the{" "}
								<code className="select-text cursor-text rounded bg-background/80 px-1 py-0.5 font-mono text-[13px]">
									superset
								</code>{" "}
								CLI
							</p>
							<p className="text-sm leading-relaxed text-muted-foreground">
								It&apos;s available in every Superset terminal. Tell the agent
								to use it to spin up workspaces, run tasks, or manage other
								automations.{" "}
								<a
									href={`${COMPANY.DOCS_URL}/cli/getting-started`}
									target="_blank"
									rel="noreferrer"
									className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
								>
									Getting started
								</a>{" "}
								·{" "}
								<a
									href={`${COMPANY.DOCS_URL}/cli/cli-reference`}
									target="_blank"
									rel="noreferrer"
									className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
								>
									CLI reference
								</a>
							</p>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => setCliHintDismissed(true)}
							aria-label="Dismiss"
							className="absolute right-2 top-2 size-6 text-muted-foreground hover:text-foreground"
						>
							<LuX className="size-3.5" />
						</Button>
					</div>
				</div>
			)}

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{!automationsReady ? null : visible.length === 0 && scope === "mine" ? (
					<div className="flex-1 overflow-y-auto px-8 py-8">
						<AutomationsEmptyState onSelectTemplate={handleSelectTemplate} />
					</div>
				) : visible.length === 0 ? (
					<Empty className="flex-1">
						<EmptyHeader>
							<EmptyMedia
								variant="icon"
								className="size-14 [&_svg:not([class*='size-'])]:size-7"
							>
								<LuSearchX />
							</EmptyMedia>
							<EmptyTitle>No team automations</EmptyTitle>
							<EmptyDescription>
								Nobody on your team has shared automations yet.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="flex min-h-0 flex-1 flex-col">
						<div
							className={cn(
								rowGrid,
								"sticky top-0 z-10 h-8 border-b border-border bg-background px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80",
							)}
						>
							<span>Name</span>
							{scope === "team" && <span>Owner</span>}
							<span>Project</span>
							<span>Workspace</span>
							<span>Device</span>
							<span>Agent</span>
							<span>Schedule</span>
							<span />
						</div>

						<div className="min-h-0 flex-1 overflow-y-auto">
							{visible.map((automation) => {
								const owner = usersById.get(automation.ownerUserId);
								const project = projectsById.get(automation.v2ProjectId);
								const workspace = automation.v2WorkspaceId
									? workspacesById.get(automation.v2WorkspaceId)
									: null;
								const workspaceLabel = !automation.v2WorkspaceId
									? "New workspace"
									: (workspace?.name ?? "Deleted");
								const host = automation.targetHostId
									? hostsById.get(automation.targetHostId)
									: null;
								const isOwner = automation.ownerUserId === currentUserId;

								return (
									// biome-ignore lint/a11y/useSemanticElements: row needs nested interactive elements
									<div
										key={automation.id}
										role="button"
										tabIndex={0}
										onClick={() =>
											navigate({
												to: "/automations/$automationId",
												params: { automationId: automation.id },
											})
										}
										onKeyDown={(event) => {
											if (event.target !== event.currentTarget) return;
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												navigate({
													to: "/automations/$automationId",
													params: { automationId: automation.id },
												});
											}
										}}
										className={cn(
											rowGrid,
											"group/row h-10 min-w-0 cursor-pointer border-b border-border/50 px-4 text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
										)}
									>
										<span className="flex min-w-0 items-center gap-2">
											<span
												className={cn(
													"inline-block size-2 shrink-0 rounded-full",
													automation.enabled
														? "bg-emerald-500"
														: "border border-muted-foreground/60",
												)}
											/>
											<span
												className={cn(
													"min-w-0 truncate font-medium",
													!automation.enabled && "text-muted-foreground",
												)}
												title={automation.name}
											>
												{automation.name}
											</span>
											{!automation.enabled && (
												<Badge
													variant="secondary"
													className="shrink-0 text-[10px]"
												>
													paused
												</Badge>
											)}
										</span>

										{scope === "team" && (
											<span
												className="min-w-0 truncate text-xs text-muted-foreground"
												title={owner?.email ?? undefined}
											>
												{owner?.name ?? owner?.email ?? "—"}
											</span>
										)}

										<span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
											{project ? (
												<ProjectThumbnail
													projectName={project.name}
													iconUrl={project.iconUrl}
													className="!size-3.5 shrink-0"
												/>
											) : null}
											<span className="min-w-0 truncate">
												{project?.name ?? "—"}
											</span>
										</span>

										<span className="min-w-0 text-xs text-muted-foreground">
											<CellWithIcon
												icon={
													automation.v2WorkspaceId ? (
														<LuGitBranch className="size-3 shrink-0" />
													) : (
														<LuSparkles className="size-3 shrink-0" />
													)
												}
												label={workspaceLabel}
											/>
										</span>

										<span className="min-w-0 text-xs text-muted-foreground">
											<CellWithIcon
												icon={
													<HiOutlineComputerDesktop className="size-3 shrink-0" />
												}
												label={host?.name ?? "Auto"}
											/>
										</span>

										<span className="min-w-0 text-xs text-muted-foreground">
											<AgentCell
												agentId={automation.agent}
												hostId={automation.targetHostId ?? null}
											/>
										</span>

										<span
											className="min-w-0 truncate text-xs text-muted-foreground"
											title={describeSchedule(automation.rrule)}
										>
											{describeSchedule(automation.rrule)}
										</span>

										<span className="flex items-center justify-end">
											{isOwner && (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon-sm"
															onClick={(e) => e.stopPropagation()}
															aria-label="Row actions"
															className="opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100"
														>
															<LuEllipsis className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent
														align="end"
														onClick={(e) => e.stopPropagation()}
													>
														<DropdownMenuItem
															onSelect={() =>
																navigate({
																	to: "/automations/$automationId",
																	params: {
																		automationId: automation.id,
																	},
																})
															}
														>
															<LuPencil className="size-4" />
															Edit
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={() =>
																runNowMutation.mutate({
																	id: automation.id,
																	name: automation.name,
																})
															}
														>
															<LuPlay className="size-4" />
															Run now
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={() =>
																navigate({
																	to: "/automations/$automationId",
																	params: { automationId: automation.id },
																	search: { history: true },
																})
															}
														>
															<LuClock className="size-4" />
															Version history
														</DropdownMenuItem>
														<DropdownMenuItem
															variant="destructive"
															onSelect={() => setPendingDelete(automation)}
														>
															<LuTrash2 className="size-4" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</div>

			<CreateAutomationDialog
				open={createOpen}
				onOpenChange={handleDialogOpenChange}
				initialTemplate={initialTemplate}
				onCreated={() => handleDialogOpenChange(false)}
			/>

			<AlertDialog
				open={!!pendingDelete}
				onOpenChange={(next) => {
					if (!next) setPendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete automation?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete ? (
								<>
									"{pendingDelete.name}" will stop firing and its run history
									will be removed. This can't be undone.
								</>
							) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (pendingDelete) {
									deleteMutation.mutate({
										id: pendingDelete.id,
										name: pendingDelete.name,
									});
								}
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
