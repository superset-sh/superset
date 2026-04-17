import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	HiArrowRight,
	HiChevronDown,
	HiPaperAirplane,
	HiXMark,
} from "react-icons/hi2";
import { VscIssues } from "react-icons/vsc";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { buildTaskAgentLaunchRequest } from "shared/utils/agent-launch-request";
import {
	type AgentDefinitionId,
	getEnabledAgentConfigs,
	getFallbackAgentId,
	indexResolvedAgentConfigs,
} from "shared/utils/agent-settings";
import { sanitizeSegment } from "shared/utils/branch";

type TaskLaunchAgent = AgentDefinitionId | "none";

function stateColor(state: string): string {
	return state === "Open"
		? "text-green-500"
		: state === "In Progress"
			? "text-blue-500"
			: state === "In Review"
				? "text-yellow-500"
				: "text-muted-foreground";
}

export function IssueDetailSidebar({
	projectPath,
	issueNumber,
	onClose,
	width,
	onWidthChange,
}: {
	projectPath: string;
	issueNumber: number;
	onClose: () => void;
	width: number;
	onWidthChange: (w: number) => void;
}) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();

	const { data: onedevConfig } =
		electronTrpc.settings.getOnedevConfig.useQuery();
	const { data: onedevUsers = [] } =
		electronTrpc.settings.getOnedevUsers.useQuery();
	const { data: issue, isLoading } =
		electronTrpc.settings.getOnedevIssue.useQuery(
			{ projectPath, issueNumber },
			{ refetchInterval: 15000 },
		);
	const { data: comments } =
		electronTrpc.settings.getOnedevIssueComments.useQuery(
			{ issueId: issue?.id ?? 0 },
			{ enabled: !!issue?.id, refetchInterval: 15000 },
		);

	const updateState = electronTrpc.settings.updateOnedevIssueState.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssue.invalidate();
			utils.settings.getOnedevIssues.invalidate();
		},
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Error"),
	});
	const updateAssignee =
		electronTrpc.settings.updateOnedevIssueAssignee.useMutation({
			onSuccess: () => {
				utils.settings.getOnedevIssue.invalidate();
			},
			onError: (err: unknown) =>
				toast.error(err instanceof Error ? err.message : "Error"),
		});
	const updateFields =
		electronTrpc.settings.updateOnedevIssueFields.useMutation({
			onSuccess: () => utils.settings.getOnedevIssue.invalidate(),
			onError: (err: unknown) =>
				toast.error(err instanceof Error ? err.message : "Error"),
		});
	const addComment = electronTrpc.settings.createOnedevIssueComment.useMutation(
		{
			onSuccess: () => {
				utils.settings.getOnedevIssueComments.invalidate();
				setCommentDraft("");
			},
			onError: (err: unknown) =>
				toast.error(err instanceof Error ? err.message : "Error"),
		},
	);

	const [commentDraft, setCommentDraft] = useState("");
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const [isEditingDesc, setIsEditingDesc] = useState(false);
	const [descDraft, setDescDraft] = useState("");

	const updateTitle = electronTrpc.settings.updateOnedevIssueTitle.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssue.invalidate();
			utils.settings.getOnedevIssues.invalidate();
			setIsEditingTitle(false);
		},
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Error"),
	});
	const updateDesc =
		electronTrpc.settings.updateOnedevIssueDescription.useMutation({
			onSuccess: () => {
				utils.settings.getOnedevIssue.invalidate();
				setIsEditingDesc(false);
			},
			onError: (err: unknown) =>
				toast.error(err instanceof Error ? err.message : "Error"),
		});
	const isResizing = useRef(false);

	const handleMouseDown = useCallback(() => {
		isResizing.current = true;
		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing.current) return;
			const newWidth = window.innerWidth - e.clientX;
			onWidthChange(Math.max(280, Math.min(600, newWidth)));
		};
		const handleMouseUp = () => {
			isResizing.current = false;
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	}, [onWidthChange]);

	// Workspace launch
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const agentPresetsQuery = electronTrpc.settings.getAgentPresets.useQuery();
	const agentPresets = agentPresetsQuery.data ?? [];
	const enabledAgentPresets = useMemo(
		() => getEnabledAgentConfigs(agentPresets),
		[agentPresets],
	);
	const agentConfigsById = useMemo(
		() => indexResolvedAgentConfigs(agentPresets),
		[agentPresets],
	);
	const fallbackAgentId = useMemo(
		() => getFallbackAgentId(agentPresets),
		[agentPresets],
	);
	const selectableAgents = useMemo(
		() => enabledAgentPresets.map((p) => p.id),
		[enabledAgentPresets],
	);

	const {
		autoRun,
		effectiveProjectId,
		selectedAgent,
		setAutoRun,
		setSelectedAgent,
		setSelectedProjectId,
	} = useAgentLaunchPreferences<TaskLaunchAgent>({
		agentStorageKey: "lastSelectedAgent",
		defaultAgent: fallbackAgentId ?? "none",
		fallbackAgent: fallbackAgentId ?? "none",
		validAgents: ["none", ...selectableAgents],
		agentsReady: agentPresetsQuery.isFetched,
		projectStorageKey: "lastOpenedInProjectId",
		recentProjects,
		autoRunStorageKey: "agentAutoRun",
		preferredProjectMatch: projectPath,
	});

	const selectedProject = recentProjects.find(
		(p) => p.id === effectiveProjectId,
	);

	if (isLoading) {
		return (
			<div className="w-80 border-l border-border shrink-0 p-4 flex items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!issue) {
		return (
			<div className="w-80 border-l border-border shrink-0 p-4">
				<p className="text-sm text-muted-foreground">Issue not found</p>
			</div>
		);
	}

	const isClosed = issue.state === "Closed";
	const slug = issue.projectKey
		? `${issue.projectKey.toLowerCase()}-${issue.number}`
		: `#${issue.number}`;
	const _onedevUrl = onedevConfig?.url ?? "";
	const _onedevToken = onedevConfig?.accessToken ?? "";

	const branchName = (() => {
		const prefix = slug.toLowerCase();
		const titleSegment = sanitizeSegment(issue.title, 40);
		return titleSegment ? `${prefix}-${titleSegment}` : prefix;
	})();

	const handleOpen = async () => {
		if (!effectiveProjectId) return;
		if (
			selectedAgent !== "none" &&
			!agentConfigsById.get(selectedAgent)?.enabled
		) {
			toast.error("Enable an agent in Settings > Agents first");
			return;
		}

		const onedevContext = `${issue.description ?? ""}

---
## Instructions

**IMPORTANT: Always create a plan first before implementing.**

This project uses OneDev (NOT GitHub). Do NOT use \`gh\` CLI. PRs and merges are handled via the Superset UI.
When done: commit your changes. Do NOT push or create PRs.`;

		const launchRequestTemplate = buildTaskAgentLaunchRequest({
			task: {
				id: slug,
				slug,
				title: issue.title,
				description: onedevContext,
				priority: (issue.fields?.Priority as string)?.toLowerCase() ?? null,
				statusName: issue.state,
				labels: [],
			},
			workspaceId: "pending-workspace",
			selectedAgent,
			source: "open-in-workspace",
			autoRun,
			configsById: agentConfigsById,
		});

		try {
			const result = await createWorkspace.mutateAsyncWithPendingSetup(
				{ projectId: effectiveProjectId, name: slug, branchName },
				{ agentLaunchRequest: launchRequestTemplate ?? undefined },
			);

			// Always launch agent (for new workspaces the setup flow may not auto-start it)
			if (launchRequestTemplate) {
				const launchRequest: AgentLaunchRequest = {
					...launchRequestTemplate,
					workspaceId: result.workspace.id,
				};
				const launchResult = await launchAgentSession(launchRequest, {
					source: "open-in-workspace",
					createOrAttach: (input) => terminalCreateOrAttach.mutateAsync(input),
					write: (input) => terminalWrite.mutateAsync(input),
				});
				if (launchResult.status === "failed") {
					toast.error("Failed to start agent", {
						description: launchResult.error ?? "Unknown error",
					});
				}
			}

			// Transition to In Progress
			if (issue.state === "Open") {
				updateState.mutate({ issueId: issue.id, state: "In Progress" });
			}

			toast.success(
				result.wasExisting ? "Opened existing workspace" : "Workspace created",
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	return (
		<div className="shrink-0 flex overflow-hidden" style={{ width }}>
			{/* Resize handle */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: resize handle */}
			<div
				className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
				onMouseDown={handleMouseDown}
			/>
			<div className="flex-1 flex flex-col overflow-hidden border-l border-border">
				{/* Header */}
				<div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
					<div className="flex items-center gap-2 min-w-0">
						<VscIssues
							className={`size-4 shrink-0 ${stateColor(issue.state)}`}
						/>
						<span className="text-xs font-mono text-muted-foreground">
							{String(slug)}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() =>
								navigate({
									to: "/tasks/onedev/$projectPath/$issueNumber",
									params: {
										projectPath: encodeURIComponent(projectPath),
										issueNumber: String(issueNumber),
									},
								})
							}
							className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
						>
							Expand
						</button>
						<button
							type="button"
							onClick={onClose}
							className="p-1 text-muted-foreground hover:text-foreground"
						>
							<HiXMark className="size-4" />
						</button>
					</div>
				</div>

				{/* Scrollable content */}
				<div className="flex-1 overflow-y-auto">
					{/* Title */}
					<div className="px-3 py-3 border-b border-border">
						{isEditingTitle ? (
							<input
								type="text"
								value={titleDraft}
								onChange={(e) => setTitleDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && titleDraft.trim()) {
										updateTitle.mutate({
											issueId: issue.id,
											title: titleDraft.trim(),
										});
									}
									if (e.key === "Escape") {
										setIsEditingTitle(false);
									}
								}}
								onBlur={() => {
									if (titleDraft.trim() && titleDraft !== issue.title) {
										updateTitle.mutate({
											issueId: issue.id,
											title: titleDraft.trim(),
										});
									} else {
										setIsEditingTitle(false);
									}
								}}
								className="text-sm font-semibold w-full bg-transparent border-b border-primary outline-none"
							/>
						) : (
							<h3
								className="text-sm font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
								onClick={() => {
									setTitleDraft(issue.title);
									setIsEditingTitle(true);
								}}
							>
								{String(issue.title)}
							</h3>
						)}
					</div>

					{/* Properties */}
					<div className="px-3 py-3 border-b border-border flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">State</span>
							<select
								value={issue.state}
								onChange={(e) =>
									updateState.mutate({
										issueId: issue.id,
										state: e.target.value,
									})
								}
								className="h-6 text-xs rounded border bg-transparent px-1 w-32"
							>
								<option value="Open">Open</option>
								<option value="In Progress">In Progress</option>
								<option value="In Review">In Review</option>
								<option value="Closed">Closed</option>
							</select>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Type</span>
							<select
								value={String(issue.fields?.Type ?? "Task")}
								onChange={(e) =>
									updateFields.mutate({
										issueId: issue.id,
										fields: { Type: e.target.value },
									})
								}
								className="h-6 text-xs rounded border bg-transparent px-1 w-32"
							>
								<option value="New Feature">New Feature</option>
								<option value="Improvement">Improvement</option>
								<option value="Bug">Bug</option>
								<option value="Task">Task</option>
							</select>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Priority</span>
							<select
								value={String(issue.fields?.Priority ?? "Normal")}
								onChange={(e) =>
									updateFields.mutate({
										issueId: issue.id,
										fields: { Priority: e.target.value },
									})
								}
								className="h-6 text-xs rounded border bg-transparent px-1 w-32"
							>
								<option value="Critical">Critical</option>
								<option value="High">High</option>
								<option value="Normal">Normal</option>
								<option value="Low">Low</option>
							</select>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Assignee</span>
							<select
								value={
									issue.fields?.Assignees != null
										? String(issue.fields.Assignees)
										: ""
								}
								onChange={(e) =>
									updateAssignee.mutate({
										issueId: issue.id,
										assignee: e.target.value || null,
									})
								}
								className="h-6 text-xs rounded border bg-transparent px-1 w-32"
							>
								<option value="">Unassigned</option>
								{onedevUsers.map((u) => (
									<option key={u.name} value={u.name}>
										{u.fullName ?? u.name}
									</option>
								))}
							</select>
						</div>
					</div>

					{/* Open in Workspace */}
					<div className="px-3 py-3 border-b border-border flex flex-col gap-2">
						<span className="text-xs text-muted-foreground">
							Open in workspace
						</span>
						<div className="flex gap-1.5">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="flex-1 justify-between font-normal h-7 min-w-0 text-xs"
									>
										<span className="flex items-center gap-1.5 truncate">
											{selectedProject ? (
												<>
													<ProjectThumbnail
														projectId={selectedProject.id}
														projectName={selectedProject.name}
														projectColor={selectedProject.color}
														githubOwner={selectedProject.githubOwner}
														hideImage={selectedProject.hideImage ?? undefined}
														iconUrl={selectedProject.iconUrl}
														className="size-3.5"
													/>
													<span className="truncate">
														{String(selectedProject.name)}
													</span>
												</>
											) : (
												<span className="text-muted-foreground">
													Select project
												</span>
											)}
										</span>
										<HiChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									className="w-[--radix-dropdown-menu-trigger-width]"
								>
									{recentProjects
										.filter((p) => p.id)
										.map((project) => (
											<DropdownMenuItem
												key={project.id}
												onClick={() => setSelectedProjectId(project.id)}
												className="flex items-center gap-2"
											>
												<ProjectThumbnail
													projectId={project.id}
													projectName={project.name}
													projectColor={project.color}
													githubOwner={project.githubOwner}
													hideImage={project.hideImage ?? undefined}
													iconUrl={project.iconUrl}
													className="size-3.5"
												/>
												{String(project.name)}
											</DropdownMenuItem>
										))}
								</DropdownMenuContent>
							</DropdownMenu>
							<Button
								size="icon"
								className="h-8 w-8 shrink-0"
								disabled={!effectiveProjectId || createWorkspace.isPending}
								onClick={handleOpen}
							>
								<HiArrowRight className="w-4 h-4" />
							</Button>
						</div>
						<AgentSelect<TaskLaunchAgent>
							agents={enabledAgentPresets}
							value={selectedAgent}
							placeholder="Select agent"
							onValueChange={setSelectedAgent}
							triggerClassName="h-7 text-xs"
							allowNone
							noneLabel="No agent"
							noneValue="none"
						/>
						<div className="flex items-center justify-between">
							<Label htmlFor="sidebar-auto-run" className="text-xs font-normal">
								Auto-run
							</Label>
							<Switch
								id="sidebar-auto-run"
								checked={autoRun}
								onCheckedChange={setAutoRun}
							/>
						</div>
						<button
							type="button"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
							disabled={updateState.isPending}
							onClick={() =>
								updateState.mutate({
									issueId: issue.id,
									state: isClosed ? "Open" : "Closed",
								})
							}
						>
							{updateState.isPending
								? "..."
								: isClosed
									? "Reopen Issue"
									: "Close Issue"}
						</button>
					</div>

					{/* Description */}
					<div className="px-3 py-3 border-b border-border">
						<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
							Description
						</h4>
						{isEditingDesc ? (
							<div className="flex flex-col gap-1">
								<textarea
									value={descDraft}
									onChange={(e) => setDescDraft(e.target.value)}
									className="text-xs w-full bg-transparent border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary min-h-[60px] resize-y"
								/>
								<div className="flex gap-1 justify-end">
									<button
										type="button"
										onClick={() => setIsEditingDesc(false)}
										className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5"
									>
										Cancel
									</button>
									<Button
										size="sm"
										className="h-6 text-xs px-2"
										onClick={() =>
											updateDesc.mutate({
												issueId: issue.id,
												description: descDraft,
											})
										}
										disabled={updateDesc.isPending}
									>
										{updateDesc.isPending ? "..." : "Save"}
									</Button>
								</div>
							</div>
						) : (
							<p
								className="text-xs text-muted-foreground whitespace-pre-wrap cursor-pointer hover:text-foreground transition-colors"
								onClick={() => {
									setDescDraft(issue.description ?? "");
									setIsEditingDesc(true);
								}}
							>
								{issue.description
									? String(issue.description)
									: "Click to add description..."}
							</p>
						)}
					</div>

					{/* Activity / Comments */}
					<div className="px-3 py-3">
						<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
							Activity
						</h4>

						<div className="flex items-start gap-2 mb-3">
							<div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
								S
							</div>
							<span className="text-xs text-muted-foreground">
								{"Issue created · "}
								{new Date(issue.submitDate).toLocaleDateString("de-DE")}
							</span>
						</div>

						{(comments ?? []).map(
							(comment: { id: number; content: string; date: string }) => (
								<div key={comment.id} className="flex items-start gap-2 mb-3">
									<div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
										C
									</div>
									<div className="min-w-0">
										<span className="text-xs text-muted-foreground">
											{new Date(comment.date).toLocaleDateString("de-DE")}
										</span>
										<p className="text-xs mt-0.5 whitespace-pre-wrap break-words">
											{String(comment.content)}
										</p>
									</div>
								</div>
							),
						)}
					</div>
				</div>

				{/* Comment input */}
				<div className="border-t border-border px-3 py-2 shrink-0 flex gap-2">
					<textarea
						value={commentDraft}
						onChange={(e) => {
							setCommentDraft(e.target.value);
							e.target.style.height = "auto";
							e.target.style.height = `${e.target.scrollHeight}px`;
						}}
						placeholder="Write a comment..."
						rows={1}
						className="flex-1 resize-none text-xs bg-transparent border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary max-h-48"
						onKeyDown={(e) => {
							if (
								e.key === "Enter" &&
								(e.metaKey || e.ctrlKey) &&
								commentDraft.trim()
							) {
								addComment.mutate({
									issueId: issue.id,
									content: commentDraft.trim(),
								});
							}
						}}
					/>
					<Button
						size="icon"
						className="h-7 w-7 shrink-0"
						disabled={!commentDraft.trim() || addComment.isPending}
						onClick={() =>
							addComment.mutate({
								issueId: issue.id,
								content: commentDraft.trim(),
							})
						}
					>
						<HiPaperAirplane className="size-3" />
					</Button>
				</div>
			</div>
		</div>
	);
}
