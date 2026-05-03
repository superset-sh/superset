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
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
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
	LuSparkles,
	LuTrash2,
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

function AutomationsPage() {
	const navigate = useNavigate();
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;

	const [createOpen, setCreateOpen] = useState(false);
	const [initialTemplate, setInitialTemplate] =
		useState<AutomationTemplate | null>(null);
	const [scope, setScope] = useState<Scope>("mine");
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
	const automations = automationRows as SelectAutomation[];

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

	const usersById = useMemo(
		() =>
			new Map(
				(userRows as Pick<SelectUser, "id" | "name" | "email">[]).map((u) => [
					u.id,
					u,
				]),
			),
		[userRows],
	);
	const projectsById = useMemo(
		() => new Map(recentProjects.map((p) => [p.id, p])),
		[recentProjects],
	);
	const workspacesById = useMemo(
		() =>
			new Map(
				(workspaceRows as Pick<SelectV2Workspace, "id" | "name">[]).map((w) => [
					w.id,
					w,
				]),
			),
		[workspaceRows],
	);
	const hostsById = useMemo(
		() =>
			new Map(
				(hostRows as Pick<SelectV2Host, "machineId" | "name">[]).map((h) => [
					h.machineId,
					h,
				]),
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

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex items-start justify-between border-b px-8 py-6">
				<div>
					<h1 className="text-2xl font-semibold">Automations</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Run agents on a schedule to automate work.{" "}
						<Button
							asChild
							variant="link"
							size="sm"
							className="p-0 h-auto align-baseline"
						>
							<a
								href={`${COMPANY.DOCS_URL}/automations`}
								target="_blank"
								rel="noreferrer"
							>
								Learn more
							</a>
						</Button>
					</p>
				</div>
				<Button type="button" onClick={() => setCreateOpen(true)}>
					<LuPlus className="size-4" />
					New automation
				</Button>
			</header>

			<div className="flex-1 overflow-y-auto px-8 py-6">
				{!automationsReady ? null : automations.length === 0 ? (
					<AutomationsEmptyState onSelectTemplate={handleSelectTemplate} />
				) : (
					<>
						<div className="mb-4 flex justify-end">
							<ToggleGroup
								type="single"
								variant="outline"
								size="sm"
								value={scope}
								onValueChange={(v) => {
									if (v) setScope(v as Scope);
								}}
							>
								<ToggleGroupItem value="mine">
									Mine{" "}
									<span className="ml-1 text-muted-foreground">
										{mineCount}
									</span>
								</ToggleGroupItem>
								<ToggleGroupItem value="team">
									Team{" "}
									<span className="ml-1 text-muted-foreground">
										{teamCount}
									</span>
								</ToggleGroupItem>
							</ToggleGroup>
						</div>

						{visible.length === 0 ? (
							<div className="rounded-md border border-dashed px-8 py-12 text-center text-sm text-muted-foreground">
								{scope === "mine"
									? "You haven't created any automations yet."
									: "Nobody on your team has shared automations yet."}
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										{scope === "team" && <TableHead>Owner</TableHead>}
										<TableHead>Project</TableHead>
										<TableHead>Workspace</TableHead>
										<TableHead>Device</TableHead>
										<TableHead>Agent</TableHead>
										<TableHead>Schedule</TableHead>
										<TableHead className="w-8" />
									</TableRow>
								</TableHeader>
								<TableBody>
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
										return (
											<TableRow
												key={automation.id}
												className="cursor-pointer"
												onClick={() =>
													navigate({
														to: "/automations/$automationId",
														params: { automationId: automation.id },
													})
												}
											>
												<TableCell
													className={cn(
														"font-medium",
														!automation.enabled && "text-muted-foreground",
													)}
												>
													<span className="inline-flex items-center gap-2">
														<span
															className={cn(
																"inline-block size-2 rounded-full shrink-0",
																automation.enabled
																	? "bg-emerald-500"
																	: "border border-muted-foreground/60",
															)}
														/>
														<span className="truncate">{automation.name}</span>
														{!automation.enabled && (
															<Badge
																variant="secondary"
																className="text-[10px]"
															>
																paused
															</Badge>
														)}
													</span>
												</TableCell>
												{scope === "team" && (
													<TableCell className="text-muted-foreground">
														{owner?.name ?? owner?.email ?? "—"}
													</TableCell>
												)}
												<TableCell className="text-muted-foreground">
													<span className="inline-flex items-center gap-1.5">
														{project ? (
															<ProjectThumbnail
																projectName={project.name}
																iconUrl={project.iconUrl}
																className="!size-4"
															/>
														) : null}
														<span className="truncate">
															{project?.name ?? "—"}
														</span>
													</span>
												</TableCell>
												<TableCell className="text-muted-foreground">
													<CellWithIcon
														icon={
															automation.v2WorkspaceId ? (
																<LuGitBranch className="size-3.5 shrink-0" />
															) : (
																<LuSparkles className="size-3.5 shrink-0" />
															)
														}
														label={workspaceLabel}
													/>
												</TableCell>
												<TableCell className="text-muted-foreground">
													<CellWithIcon
														icon={
															<HiOutlineComputerDesktop className="size-3.5 shrink-0" />
														}
														label={host?.name ?? "Auto"}
													/>
												</TableCell>
												<TableCell className="text-muted-foreground">
													<AgentCell
														agentId={automation.agentConfig.id}
														label={automation.agentConfig.label}
													/>
												</TableCell>
												<TableCell className="text-muted-foreground">
													{describeSchedule(automation.rrule)}
												</TableCell>
												<TableCell>
													{automation.ownerUserId === currentUserId && (
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon-sm"
																	onClick={(e) => e.stopPropagation()}
																	aria-label="Row actions"
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
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						)}
					</>
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
