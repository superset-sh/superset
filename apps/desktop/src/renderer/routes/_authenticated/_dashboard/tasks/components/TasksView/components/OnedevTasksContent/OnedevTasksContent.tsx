import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HiPlus } from "react-icons/hi2";
import { VscIssues } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { IssueDetailSidebar } from "./IssueDetailSidebar";

interface OnedevIssue {
	id: number;
	number: number;
	title: string;
	description: string | null;
	state: string;
	stateOrdinal: number;
	submitDate: string;
	projectId: number;
	commentCount: number;
}

const KANBAN_COLUMNS_ACTIVE = ["Open", "In Progress", "In Review"] as const;
const KANBAN_COLUMNS_CLOSED = ["Closed"] as const;

type StateFilter = "all" | "active" | "backlog" | "closed";

function stateColor(state: string): string {
	return state === "Open"
		? "text-green-500"
		: state === "In Progress"
			? "text-blue-500"
			: state === "In Review"
				? "text-yellow-500"
				: "text-muted-foreground";
}

function filterByState(issues: OnedevIssue[], filter: StateFilter): OnedevIssue[] {
	switch (filter) {
		case "active":
			return issues.filter((i) => i.state === "In Progress" || i.state === "In Review");
		case "backlog":
			return issues.filter((i) => i.state === "Open");
		case "closed":
			return issues.filter((i) => i.state === "Closed");
		case "all":
		default:
			return issues.filter((i) => i.state !== "Closed");
	}
}

export function OnedevTasksContent({
	searchQuery,
	viewMode,
	stateFilter = "all",
}: {
	searchQuery: string;
	viewMode: "table" | "board";
	stateFilter?: StateFilter;
}) {
	const navigate = useNavigate();
	const { data: onedevConfig } = electronTrpc.settings.getOnedevConfig.useQuery();
	const { data: onedevProjectPaths, isLoading } = electronTrpc.workspaces.getOnedevProjectPaths.useQuery();
	const isConfigured = !!onedevConfig?.url && !!onedevConfig?.accessToken;
	const [selectedIssue, setSelectedIssue] = useState<{ projectPath: string; issueNumber: number } | null>(null);
	const [sidebarWidth, setSidebarWidth] = useState(320);

	const emptySidebar = (
		<div className="border-l border-border shrink-0 flex items-center justify-center text-muted-foreground text-xs p-4" style={{ width: sidebarWidth }}>
			{!isConfigured ? "Configure OneDev in Settings > Git" : isLoading ? "Loading..." : "Select an issue to view details"}
		</div>
	);

	const sidebar = selectedIssue !== null ? (
		<IssueDetailSidebar
			key={`${selectedIssue.projectPath}-${String(selectedIssue.issueNumber)}`}
			projectPath={selectedIssue.projectPath}
			issueNumber={selectedIssue.issueNumber}
			onClose={() => setSelectedIssue(null)}
			width={sidebarWidth}
			onWidthChange={setSidebarWidth}
		/>
	) : emptySidebar;

	if (!isConfigured) {
		return (
			<div className="flex-1 flex">
				<div className="flex-1 flex items-center justify-center p-6">
					<div className="flex flex-col items-center gap-4 max-w-md text-center">
						<div className="flex size-16 items-center justify-center rounded-xl border bg-muted/50">
							<VscIssues className="size-8" />
						</div>
						<div className="space-y-2">
							<h3 className="text-lg font-semibold">Connect OneDev</h3>
							<p className="text-sm text-muted-foreground">
								Configure your OneDev server in Settings &gt; Git to view and manage issues.
							</p>
						</div>
						<Button onClick={() => navigate({ to: "/settings/git" })}>Configure OneDev</Button>
					</div>
				</div>
				{emptySidebar}
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex">
				<div className="flex-1 flex items-center justify-center">
					<p className="text-sm text-muted-foreground">Loading projects...</p>
				</div>
				{emptySidebar}
			</div>
		);
	}

	if (!onedevProjectPaths || onedevProjectPaths.length === 0) {
		return (
			<div className="flex-1 flex">
				<div className="flex-1 flex items-center justify-center">
					<p className="text-sm text-muted-foreground">
						No OneDev projects found. Add a project with a OneDev remote first.
					</p>
				</div>
				{emptySidebar}
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-hidden flex">
			<div className="flex-1 overflow-hidden flex flex-col min-w-0">
				{onedevProjectPaths.map((path) => (
					<OnedevProjectView
						key={path}
						projectPath={path}
						searchQuery={searchQuery}
						viewMode={viewMode}
						allProjectPaths={onedevProjectPaths}
						stateFilter={stateFilter}
						onIssueClick={(num: number) =>
							setSelectedIssue({ projectPath: path, issueNumber: num })
						}
					/>
				))}
			</div>
			{sidebar}
		</div>
	);
}

function OnedevProjectView({
	projectPath,
	searchQuery,
	viewMode,
	allProjectPaths,
	stateFilter,
	onIssueClick,
}: {
	projectPath: string;
	searchQuery: string;
	viewMode: "table" | "board";
	allProjectPaths: string[];
	stateFilter: StateFilter;
	onIssueClick: (n: number) => void;
}) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const { data, isLoading } = electronTrpc.settings.getOnedevIssues.useQuery(
		{ projectPath },
		{ refetchInterval: 30000 },
	);
	const updateState = electronTrpc.settings.updateOnedevIssueState.useMutation({
		onSuccess: () => utils.settings.getOnedevIssues.invalidate(),
	});
	const [isCreateOpen, setIsCreateOpen] = useState(false);

	const allIssues = data?.issues ?? [];
	const projectKey = data?.projectKey ?? projectPath;

	const filteredIssues = useMemo(() => {
		const stateFiltered = filterByState(allIssues, stateFilter);
		if (!searchQuery.trim()) return stateFiltered;
		const q = searchQuery.toLowerCase();
		const key = projectKey.toLowerCase();
		return stateFiltered.filter((issue) => {
			const slug = `${key}-${issue.number}`;
			return slug.includes(q) || issue.title.toLowerCase().includes(q) || issue.description?.toLowerCase().includes(q);
		});
	}, [allIssues, searchQuery, projectKey, stateFilter]);

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center py-8">
				<p className="text-sm text-muted-foreground">Loading issues...</p>
			</div>
		);
	}

	const showClosed = stateFilter === "closed";
	const columns = showClosed ? KANBAN_COLUMNS_CLOSED : KANBAN_COLUMNS_ACTIVE;

	return (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Project header */}
			<div className="flex items-center gap-2 px-4 pt-3 pb-1">
				{projectKey !== projectPath && (
					<span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
						{projectKey}
					</span>
				)}
				<span className="text-sm font-semibold">{projectPath}</span>
				<span className="text-xs text-muted-foreground">
					{filteredIssues.length}{" "}issues
				</span>
				<button
					type="button"
					onClick={() => setIsCreateOpen(true)}
					className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-foreground bg-accent/40 hover:bg-accent rounded-md transition-colors"
				>
					<HiPlus className="size-3.5" />
					<span>New issue</span>
				</button>
			</div>

			{viewMode === "board" ? (
				<KanbanBoard
					issues={filteredIssues}
					columns={columns}
					showClosed={showClosed}
					projectKey={projectKey}
					projectPath={projectPath}
					navigate={navigate}
					onStateChange={(id, state) => updateState.mutate({ issueId: id, state })}
					onIssueClick={onIssueClick}
				/>
			) : (
				<ListView issues={filteredIssues} projectKey={projectKey} projectPath={projectPath} navigate={navigate} onIssueClick={onIssueClick} />
			)}
			<CreateOnedevIssueDialog
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				projectPaths={allProjectPaths}
				initialProject={projectPath}
			/>
		</div>
	);
}

function KanbanBoard({
	issues,
	columns,
	showClosed,
	projectKey,
	projectPath,
	navigate,
	onStateChange,
	onIssueClick,
}: {
	issues: OnedevIssue[];
	columns: readonly string[];
	showClosed: boolean;
	projectKey: string;
	projectPath: string;
	navigate: ReturnType<typeof useNavigate>;
	onStateChange: (issueId: number, newState: string) => void;
	onIssueClick: (n: number) => void;
}) {
	const [draggedIssue, setDraggedIssue] = useState<OnedevIssue | null>(null);

	const issuesByState = useMemo(() => {
		const map: Record<string, OnedevIssue[]> = {};
		for (const col of columns) {
			map[col] = [];
		}
		for (const issue of issues) {
			const col = columns.find((c) => c === issue.state);
			const state = col ?? (showClosed ? "Closed" : "Open");
			if (!map[state]) map[state] = [];
			map[state].push(issue);
		}
		return map;
	}, [issues, columns, showClosed]);

	return (
		<div className="flex-1 flex min-h-0 overflow-x-auto">
			<div className="flex gap-4 p-4 min-w-max items-stretch flex-1">
				{columns.map((state) => (
					<KanbanColumn
						key={state}
						state={state}
						issues={issuesByState[state] ?? []}
						projectKey={projectKey}
						projectPath={projectPath}
						draggedIssue={draggedIssue}
						onDragStart={setDraggedIssue}
						onDrop={(targetState) => {
							if (draggedIssue && draggedIssue.state !== targetState) {
								onStateChange(draggedIssue.id, targetState);
							}
							setDraggedIssue(null);
						}}
						navigate={navigate}
						onIssueClick={onIssueClick}
					/>
				))}
			</div>
		</div>
	);
}

function KanbanColumn({
	state,
	issues,
	projectKey,
	projectPath,
	draggedIssue,
	onDragStart,
	onDrop,
	navigate,
	onIssueClick,
}: {
	state: string;
	issues: OnedevIssue[];
	projectKey: string;
	projectPath: string;
	draggedIssue: OnedevIssue | null;
	onDragStart: (issue: OnedevIssue) => void;
	onDrop: (targetState: string) => void;
	navigate: ReturnType<typeof useNavigate>;
	onIssueClick: (n: number) => void;
}) {
	const [isDragOver, setIsDragOver] = useState(false);

	const dropHandlers = {
		onDragOver: (e: React.DragEvent) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			if (!isDragOver) setIsDragOver(true);
		},
		onDragLeave: (e: React.DragEvent) => {
			const rect = e.currentTarget.getBoundingClientRect();
			const { clientX, clientY } = e;
			if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
				setIsDragOver(false);
			}
		},
		onDrop: (e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			onDrop(state);
		},
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target
		<div
			className={`w-72 shrink-0 flex flex-col rounded-lg border-2 transition-colors h-full ${
				isDragOver ? "border-primary/50 bg-accent/20" : "border-transparent"
			}`}
			{...dropHandlers}
		>
			<div className="flex items-center gap-2 px-2 py-2 mb-2">
				<VscIssues className={`size-4 ${stateColor(state)}`} />
				<span className="text-sm font-medium">{state}</span>
				<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{issues.length}</span>
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone */}
			<div className="flex flex-col gap-2 flex-1 overflow-y-auto px-1 min-h-[100px]" {...dropHandlers}>
				{issues.map((issue) => {
					const slug = `${projectKey.toLowerCase()}-${issue.number}`;
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: draggable card
						<div
							key={issue.id}
							draggable
							onDragStart={(e) => {
								e.dataTransfer.effectAllowed = "move";
								e.dataTransfer.setData("text/plain", String(issue.id));
								onDragStart(issue);
							}}
							onClick={() => onIssueClick(issue.number)}
							className={`text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-grab active:cursor-grabbing ${
								draggedIssue?.id === issue.id ? "opacity-50" : ""
							}`}
						>
							<div className="flex items-center gap-2 mb-1">
								<span className="text-xs text-muted-foreground tabular-nums">{slug}</span>
							</div>
							<p className="text-sm font-medium line-clamp-2">{issue.title}</p>
						</div>
					);
				})}
				{issues.length === 0 && (
					<div className="text-xs text-muted-foreground text-center py-4">No issues</div>
				)}
			</div>
		</div>
	);
}

function ListView({
	issues,
	projectKey,
	projectPath,
	navigate,
	onIssueClick,
}: {
	issues: OnedevIssue[];
	projectKey: string;
	projectPath: string;
	navigate: ReturnType<typeof useNavigate>;
	onIssueClick: (n: number) => void;
}) {
	return (
		<div className="flex-1 overflow-y-auto">
			{issues.length === 0 ? (
				<div className="px-4 py-6 text-center text-sm text-muted-foreground">No issues found</div>
			) : (
				<div className="divide-y divide-border">
					{issues.map((issue) => {
						const slug = `${projectKey.toLowerCase()}-${issue.number}`;
						const dateStr = new Date(issue.submitDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
						return (
							<button
								key={issue.id}
								type="button"
								className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer w-full text-left"
								onClick={() => onIssueClick(issue.number)}
							>
								<VscIssues className={`size-4 shrink-0 ${stateColor(issue.state)}`} />
								<span className="text-xs text-muted-foreground tabular-nums shrink-0 w-20">{slug}</span>
								<span className="text-sm truncate flex-1">{issue.title}</span>
								<span className="text-xs text-muted-foreground shrink-0 px-2 py-0.5 rounded bg-muted">{issue.state}</span>
								<span className="text-xs text-muted-foreground shrink-0 tabular-nums">{dateStr}</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

export function CreateOnedevIssueDialog({
	open,
	onOpenChange,
	projectPaths,
	initialProject,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectPaths: string[];
	initialProject?: string;
}) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [type, setType] = useState("Task");
	const [priority, setPriority] = useState("Normal");
	const [selectedProject, setSelectedProject] = useState(initialProject ?? projectPaths[0] ?? "");

	useEffect(() => {
		if (open && initialProject) {
			setSelectedProject(initialProject);
		}
	}, [open, initialProject]);

	const utils = electronTrpc.useUtils();
	const createIssue = electronTrpc.settings.createOnedevIssue.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssues.invalidate();
			toast.success("Issue created");
			setTitle("");
			setDescription("");
			onOpenChange(false);
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Issue</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-2">
					{projectPaths.length > 1 && (
						<select
							value={selectedProject}
							onChange={(e) => setSelectedProject(e.target.value)}
							className="h-8 rounded-md border bg-transparent px-2 text-sm"
						>
							{projectPaths.map((p) => (
								<option key={p} value={p}>{p}</option>
							))}
						</select>
					)}
					<Input
						placeholder="Issue title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter" && title.trim()) {
								createIssue.mutate({ projectPath: selectedProject, title: title.trim(), description: description.trim() || undefined, type, priority });
							}
						}}
					/>
					<Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
					<div className="flex gap-2">
						<div className="flex-1">
							<label className="text-xs text-muted-foreground mb-1 block">Type</label>
							<select value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
								<option value="Task">Task</option>
								<option value="Bug">Bug</option>
								<option value="New Feature">New Feature</option>
								<option value="Improvement">Improvement</option>
							</select>
						</div>
						<div className="flex-1">
							<label className="text-xs text-muted-foreground mb-1 block">Priority</label>
							<select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
								<option value="Normal">Normal</option>
								<option value="Low">Low</option>
								<option value="High">High</option>
								<option value="Critical">Critical</option>
							</select>
						</div>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
					<Button
						size="sm"
						disabled={!title.trim() || createIssue.isPending}
						onClick={() => createIssue.mutate({ projectPath: selectedProject, title: title.trim(), description: description.trim() || undefined, type, priority })}
					>
						{createIssue.isPending ? "Creating..." : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function CreateOnedevProjectDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const utils = electronTrpc.useUtils();
	const createProject = electronTrpc.settings.createOnedevProject.useMutation({
		onSuccess: () => {
			utils.workspaces.getOnedevProjectPaths.invalidate();
			utils.settings.getOnedevIssues.invalidate();
			toast.success("Project created in OneDev");
			setName("");
			setDescription("");
			onOpenChange(false);
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New OneDev Project</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-2">
					<Input
						placeholder="Project name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter" && name.trim()) {
								createProject.mutate({ name: name.trim(), description: description.trim() || undefined });
							}
						}}
					/>
					<Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
				</div>
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
					<Button
						size="sm"
						disabled={!name.trim() || createProject.isPending}
						onClick={() => createProject.mutate({ name: name.trim(), description: description.trim() || undefined })}
					>
						{createProject.isPending ? "Creating..." : "Create Project"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
