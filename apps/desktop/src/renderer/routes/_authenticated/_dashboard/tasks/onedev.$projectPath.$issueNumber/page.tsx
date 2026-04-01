import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Label } from "@superset/ui/label";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Separator } from "@superset/ui/separator";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiArrowLeft, HiArrowRight, HiChevronDown } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
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

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/onedev/$projectPath/$issueNumber/",
)({
	component: OnedevIssuePage,
});

type TaskLaunchAgent = AgentDefinitionId | "none";

function OnedevIssuePage() {
	const { projectPath, issueNumber } = Route.useParams();
	const navigate = useNavigate();
	const issueNum = Number.parseInt(issueNumber, 10);

	const { data: onedevConfig } =
		electronTrpc.settings.getOnedevConfig.useQuery();
	const { data: issue, isLoading } =
		electronTrpc.settings.getOnedevIssue.useQuery({
			projectPath: decodeURIComponent(projectPath),
			issueNumber: issueNum,
		});

	const handleBack = () => {
		navigate({ to: "/tasks" });
	};

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<span className="text-muted-foreground">Loading issue...</span>
			</div>
		);
	}

	if (!issue) {
		return (
			<div className="flex-1 flex items-center justify-center flex-col gap-4">
				<span className="text-muted-foreground">Issue not found</span>
				<Button variant="outline" onClick={handleBack}>
					Back to Tasks
				</Button>
			</div>
		);
	}

	const slug = `${(issue.projectKey ?? issue.projectPath).toLowerCase()}-${issue.number}`;

	return (
		<div className="flex-1 flex min-h-0">
			<div className="flex-1 flex flex-col min-h-0 min-w-0">
				{/* Header */}
				<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={handleBack}
					>
						<HiArrowLeft className="w-4 h-4" />
					</Button>
					<span className="text-sm text-muted-foreground">{slug}</span>
					<div className="ml-auto flex items-center gap-1">
						{issue.externalUrl && (
							<a
								href={issue.externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground hover:text-foreground transition-colors p-2"
								title="Open in OneDev"
							>
								<LuExternalLink className="w-4 h-4" />
							</a>
						)}
					</div>
				</div>

				{/* Content */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 py-6 max-w-4xl">
						<EditableIssueTitle
							issueId={issue.id}
							value={issue.title}
						/>
						<EditableIssueDescription
							issueId={issue.id}
							value={issue.description ?? ""}
						/>

						<Separator className="my-8" />

						<h2 className="text-lg font-semibold mb-4">Activity</h2>
						<div className="flex items-start gap-3">
							<div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
								S
							</div>
							<div>
								<span className="text-sm">Someone</span>
								<span className="text-sm text-muted-foreground">
									{" "}
									created the issue ·{" "}
									{new Date(issue.submitDate).toLocaleDateString("de-DE")}
								</span>
							</div>
						</div>
					</div>
				</ScrollArea>
			</div>

			{/* Properties Sidebar */}
			<div className="w-72 border-l border-border shrink-0 p-4 flex flex-col gap-6 overflow-y-auto">
				<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
					Properties
				</h3>

				{/* State */}
				<IssueStateSelector issueId={issue.id} currentState={issue.state} />

				{/* Type */}
				<IssueFieldSelector
					issueId={issue.id}
					fieldName="Type"
					currentValue={issue.fields?.Type ?? null}
					options={["New Feature", "Improvement", "Bug", "Task"]}
				/>

				{/* Priority */}
				<IssueFieldSelector
					issueId={issue.id}
					fieldName="Priority"
					currentValue={issue.fields?.Priority ?? null}
					options={["Critical", "High", "Normal", "Low"]}
				/>

				{/* Assignees */}
				{issue.fields?.Assignees && (
					<div className="flex flex-col gap-1">
						<span className="text-xs text-muted-foreground">Assignee</span>
						<span className="text-sm">
							{Array.isArray(issue.fields.Assignees)
								? issue.fields.Assignees.join(", ")
								: String(issue.fields.Assignees)}
						</span>
					</div>
				)}

				{/* Close / Reopen */}
				<CloseReopenButton issueId={issue.id} currentState={issue.state} />

				<Separator />

				{/* Open in Workspace */}
				<OpenInWorkspaceSection
					slug={slug}
					title={issue.title}
					description={issue.description}
					state={issue.state}
					priority={issue.fields?.Priority ?? null}
					issueId={issue.id}
					projectPath={decodeURIComponent(projectPath)}
					onedevUrl={onedevConfig?.url ?? ""}
					onedevToken={onedevConfig?.accessToken ?? ""}
					projectId={issue.projectId}
				/>
			</div>
		</div>
	);
}

function EditableIssueTitle({
	issueId,
	value,
}: { issueId: number; value: string }) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const utils = electronTrpc.useUtils();
	const updateTitle = electronTrpc.settings.updateOnedevIssueTitle.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssue.invalidate();
			utils.settings.getOnedevIssues.invalidate();
			setIsEditing(false);
		},
	});

	if (isEditing) {
		return (
			<input
				type="text"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => {
					if (draft.trim() && draft !== value) {
						updateTitle.mutate({ issueId, title: draft.trim() });
					} else {
						setIsEditing(false);
						setDraft(value);
					}
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" && draft.trim()) {
						updateTitle.mutate({ issueId, title: draft.trim() });
					}
					if (e.key === "Escape") {
						setIsEditing(false);
						setDraft(value);
					}
				}}
				className="text-2xl font-bold mb-4 w-full bg-transparent border-b border-primary outline-none"
				autoFocus
			/>
		);
	}

	return (
		<h1
			className="text-2xl font-bold mb-4 cursor-pointer hover:text-muted-foreground transition-colors"
			onClick={() => {
				setDraft(value);
				setIsEditing(true);
			}}
			title="Click to edit"
		>
			{value}
		</h1>
	);
}

function EditableIssueDescription({
	issueId,
	value,
}: { issueId: number; value: string }) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const utils = electronTrpc.useUtils();
	const updateDesc =
		electronTrpc.settings.updateOnedevIssueDescription.useMutation({
			onSuccess: () => {
				utils.settings.getOnedevIssue.invalidate();
				utils.settings.getOnedevIssues.invalidate();
				setIsEditing(false);
			},
		});

	if (isEditing) {
		return (
			<div className="mb-4">
				<Textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					rows={8}
					className="w-full text-sm"
					autoFocus
				/>
				<div className="flex gap-2 mt-2">
					<Button
						size="sm"
						onClick={() => updateDesc.mutate({ issueId, description: draft })}
						disabled={updateDesc.isPending}
					>
						{updateDesc.isPending ? "Saving..." : "Save"}
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							setIsEditing(false);
							setDraft(value);
						}}
					>
						Cancel
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div
			className="cursor-pointer hover:bg-accent/30 rounded-md p-2 -mx-2 transition-colors min-h-[40px]"
			onClick={() => {
				setDraft(value);
				setIsEditing(true);
			}}
			title="Click to edit"
		>
			{value ? (
				<pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
					{value}
				</pre>
			) : (
				<p className="text-sm text-muted-foreground italic">
					Click to add description...
				</p>
			)}
		</div>
	);
}

function IssueStateIcon({ state }: { state: string }) {
	const color =
		state === "Open"
			? "text-green-500"
			: state === "In Progress"
				? "text-blue-500"
				: state === "In Review"
					? "text-yellow-500"
					: "text-muted-foreground";
	return <VscIssues className={`size-4 ${color}`} />;
}

const ISSUE_STATES = ["Open", "In Progress", "In Review", "Closed"] as const;

function IssueStateSelector({
	issueId,
	currentState,
}: {
	issueId: number;
	currentState: string;
}) {
	const utils = electronTrpc.useUtils();
	const updateState = electronTrpc.settings.updateOnedevIssueState.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssue.invalidate();
			utils.settings.getOnedevIssues.invalidate();
		},
	});

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">Status</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="justify-between font-normal h-8"
						disabled={updateState.isPending}
					>
						<span className="flex items-center gap-2">
							<IssueStateIcon state={currentState} />
							{updateState.isPending ? "Updating..." : currentState}
						</span>
						<HiChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{ISSUE_STATES.map((state) => (
						<DropdownMenuItem
							key={state}
							onClick={() => {
								if (state !== currentState) {
									updateState.mutate({ issueId, state });
								}
							}}
							className="flex items-center gap-2"
						>
							<IssueStateIcon state={state} />
							{state}
							{state === currentState && (
								<span className="ml-auto text-xs text-muted-foreground">
									current
								</span>
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function IssueFieldSelector({
	issueId,
	fieldName,
	currentValue,
	options,
}: {
	issueId: number;
	fieldName: string;
	currentValue: string | null;
	options: string[];
}) {
	const utils = electronTrpc.useUtils();
	const updateFields =
		electronTrpc.settings.updateOnedevIssueFields.useMutation({
			onSuccess: () => {
				utils.settings.getOnedevIssue.invalidate();
				utils.settings.getOnedevIssues.invalidate();
			},
		});

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">{fieldName}</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="justify-between font-normal h-8"
						disabled={updateFields.isPending}
					>
						<span className="text-sm">
							{updateFields.isPending
								? "Updating..."
								: (currentValue ?? "Not set")}
						</span>
						<HiChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{options.map((option) => (
						<DropdownMenuItem
							key={option}
							onClick={() => {
								if (option !== currentValue) {
									updateFields.mutate({
										issueId,
										fields: { [fieldName]: option },
									});
								}
							}}
						>
							{option}
							{option === currentValue && (
								<span className="ml-auto text-xs text-muted-foreground">
									current
								</span>
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function OpenInWorkspaceSection({
	slug,
	title,
	description,
	state,
	priority,
	issueId,
	projectPath,
	onedevUrl,
	onedevToken,
	projectId,
}: {
	slug: string;
	title: string;
	description: string | null;
	state: string;
	priority: string | null;
	issueId: number;
	projectPath: string;
	onedevUrl: string;
	onedevToken: string;
	projectId: number;
}) {
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const updateIssueState =
		electronTrpc.settings.updateOnedevIssueState.useMutation();
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
		() => enabledAgentPresets.map((preset) => preset.id),
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

	const branchName = useMemo(() => {
		const prefix = slug.toLowerCase();
		const titleSegment = sanitizeSegment(title, 40);
		return titleSegment ? `${prefix}-${titleSegment}` : prefix;
	}, [slug, title]);

	const onedevContext = `${description ?? ""}

---
## Instructions

**IMPORTANT: Always create a plan first before implementing.**

This project uses OneDev (NOT GitHub). Do NOT use \`gh\` CLI. PRs and merges are handled via the Superset UI.
When done: commit your changes. Do NOT push or create PRs.`;

	const buildLaunchRequest = (workspaceId: string): AgentLaunchRequest | null =>
		buildTaskAgentLaunchRequest({
			task: {
				id: slug,
				slug,
				title,
				description: onedevContext,
				priority: priority?.toLowerCase() ?? null,
				statusName: state,
				labels: [],
			},
			workspaceId,
			selectedAgent,
			source: "open-in-workspace",
			autoRun,
			configsById: agentConfigsById,
		});

	const handleOpen = async () => {
		if (!effectiveProjectId) return;
		if (
			selectedAgent !== "none" &&
			!agentConfigsById.get(selectedAgent)?.enabled
		) {
			toast.error("Enable an agent in Settings > Agents first");
			return;
		}

		try {
			const launchRequestTemplate = buildLaunchRequest("pending-workspace");
			const result = await createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId: effectiveProjectId,
					name: slug,
					branchName,
				},
				{ agentLaunchRequest: launchRequestTemplate ?? undefined },
			);

			if (result.wasExisting && launchRequestTemplate) {
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
						description: launchResult.error ?? "Failed to start agent session.",
					});
					return;
				}
			}

			toast.success(
				result.wasExisting ? "Opened existing workspace" : "Workspace created",
			);

			// Auto-set issue to "In Progress" when starting work
			if (state === "Open") {
				updateIssueState.mutate({ issueId, state: "In Progress" });
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">Open in workspace</span>
			<div className="flex gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="flex-1 justify-between font-normal h-8 min-w-0"
						>
							<span className="flex items-center gap-2 truncate">
								{selectedProject ? (
									<>
										<ProjectThumbnail
											projectId={selectedProject.id}
											projectName={selectedProject.name}
											projectColor={selectedProject.color}
											githubOwner={selectedProject.githubOwner}
											hideImage={selectedProject.hideImage ?? undefined}
											iconUrl={selectedProject.iconUrl}
											className="size-4"
										/>
										<span className="truncate">{selectedProject.name}</span>
									</>
								) : (
									<span className="text-muted-foreground">Select project</span>
								)}
							</span>
							<HiChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-[--radix-dropdown-menu-trigger-width]"
					>
						{recentProjects.length === 0 ? (
							<DropdownMenuItem disabled>No projects found</DropdownMenuItem>
						) : (
							recentProjects
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
											className="size-4"
										/>
										{project.name}
									</DropdownMenuItem>
								))
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					size="icon"
					className="h-8 w-8 shrink-0"
					disabled={!effectiveProjectId || createWorkspace.isPending}
					onClick={handleOpen}
				>
					<HiArrowRight className="w-3.5 h-3.5" />
				</Button>
			</div>
			<AgentSelect<TaskLaunchAgent>
				agents={enabledAgentPresets}
				value={selectedAgent}
				placeholder="Select agent"
				onValueChange={setSelectedAgent}
				triggerClassName="h-8 text-xs"
				allowNone
				noneLabel="No agent"
				noneValue="none"
			/>
			<div className="flex items-center justify-between">
				<Label htmlFor="onedev-auto-run-toggle" className="text-xs font-normal">
					Auto-run command
				</Label>
				<Switch
					id="onedev-auto-run-toggle"
					checked={autoRun}
					onCheckedChange={setAutoRun}
				/>
			</div>
		</div>
	);
}

function CloseReopenButton({
	issueId,
	currentState,
}: {
	issueId: number;
	currentState: string;
}) {
	const utils = electronTrpc.useUtils();
	const updateState = electronTrpc.settings.updateOnedevIssueState.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssue.invalidate();
			utils.settings.getOnedevIssues.invalidate();
			toast.success(
				currentState === "Closed" ? "Issue reopened" : "Issue closed",
			);
		},
		onError: (err) => toast.error(err.message),
	});

	const isClosed = currentState === "Closed";

	return (
		<Button
			variant={isClosed ? "outline" : "destructive"}
			size="sm"
			className="w-full"
			disabled={updateState.isPending}
			onClick={() =>
				updateState.mutate({
					issueId,
					state: isClosed ? "Open" : "Closed",
				})
			}
		>
			{updateState.isPending
				? "..."
				: isClosed
					? "Reopen Issue"
					: "Close Issue"}
		</Button>
	);
}
