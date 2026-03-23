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
import { useMemo, useState } from "react";
import { VscIssues } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";

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

const KANBAN_COLUMNS = ["Open", "In Progress", "In Review", "Closed"] as const;

function stateColor(state: string): string {
	return state === "Open"
		? "text-green-500"
		: state === "In Progress"
			? "text-blue-500"
			: state === "In Review"
				? "text-yellow-500"
				: "text-muted-foreground";
}

export function OnedevTasksContent({
	searchQuery,
	viewMode,
}: {
	searchQuery: string;
	viewMode: "table" | "board";
}) {
	const navigate = useNavigate();
	const { data: onedevConfig } =
		electronTrpc.settings.getOnedevConfig.useQuery();
	const { data: onedevProjectPaths, isLoading } =
		electronTrpc.workspaces.getOnedevProjectPaths.useQuery();

	const isConfigured = !!onedevConfig?.url && !!onedevConfig?.accessToken;

	if (!isConfigured) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<div className="flex flex-col items-center gap-4 max-w-md text-center">
					<div className="flex size-16 items-center justify-center rounded-xl border bg-muted/50">
						<VscIssues className="size-8" />
					</div>
					<div className="space-y-2">
						<h3 className="text-lg font-semibold">Connect OneDev</h3>
						<p className="text-sm text-muted-foreground">
							Configure your OneDev server in Settings &gt; Git to view and
							manage issues.
						</p>
					</div>
					<Button onClick={() => navigate({ to: "/settings/git" })}>
						Configure OneDev
					</Button>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading projects...</p>
			</div>
		);
	}

	if (!onedevProjectPaths || onedevProjectPaths.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<p className="text-sm text-muted-foreground">
					No OneDev projects found. Add a project with a OneDev remote first.
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-hidden flex flex-col">
			{onedevProjectPaths.map((path) => (
				<OnedevProjectView
					key={path}
					projectPath={path}
					searchQuery={searchQuery}
					viewMode={viewMode}
				/>
			))}
		</div>
	);
}

function OnedevProjectView({
	projectPath,
	searchQuery,
	viewMode,
}: {
	projectPath: string;
	searchQuery: string;
	viewMode: "table" | "board";
}) {
	const utils = electronTrpc.useUtils();
	const { data, isLoading } = electronTrpc.settings.getOnedevIssues.useQuery(
		{ projectPath },
		{ refetchInterval: 30000 },
	);
	const updateState = electronTrpc.settings.updateOnedevIssueState.useMutation({
		onSuccess: () => utils.settings.getOnedevIssues.invalidate(),
	});

	const allIssues = data?.issues ?? [];
	const projectKey = data?.projectKey ?? projectPath;

	const filteredIssues = useMemo(() => {
		if (!searchQuery.trim()) return allIssues;
		const q = searchQuery.toLowerCase();
		const key = projectKey.toLowerCase();
		return allIssues.filter((issue) => {
			const slug = `${key}-${issue.number}`;
			return (
				slug.includes(q) ||
				issue.title.toLowerCase().includes(q) ||
				issue.description?.toLowerCase().includes(q)
			);
		});
	}, [allIssues, searchQuery, projectKey]);

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center py-8">
				<p className="text-sm text-muted-foreground">Loading issues...</p>
			</div>
		);
	}

	if (viewMode === "board") {
		return (
			<KanbanView
				issues={filteredIssues}
				projectKey={projectKey}
				projectPath={projectPath}
				onStateChange={(issueId, newState) =>
					updateState.mutate({ issueId, state: newState })
				}
			/>
		);
	}

	return (
		<ListView
			issues={filteredIssues}
			projectKey={projectKey}
			projectPath={projectPath}
		/>
	);
}

function KanbanView({
	issues,
	projectKey,
	projectPath,
	onStateChange,
}: {
	issues: OnedevIssue[];
	projectKey: string;
	projectPath: string;
	onStateChange: (issueId: number, newState: string) => void;
}) {
	const [draggedIssue, setDraggedIssue] = useState<OnedevIssue | null>(null);

	const issuesByState = useMemo(() => {
		const map: Record<string, OnedevIssue[]> = {};
		for (const col of KANBAN_COLUMNS) {
			map[col] = [];
		}
		for (const issue of issues) {
			const state = KANBAN_COLUMNS.includes(
				issue.state as (typeof KANBAN_COLUMNS)[number],
			)
				? issue.state
				: "Open";
			if (!map[state]) map[state] = [];
			map[state].push(issue);
		}
		return map;
	}, [issues]);

	return (
		<div className="flex-1 flex min-h-0 overflow-x-auto">
			<div className="flex gap-4 p-4 min-w-max items-stretch flex-1">
				{KANBAN_COLUMNS.map((state) => (
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
}: {
	state: string;
	issues: OnedevIssue[];
	projectKey: string;
	projectPath: string;
	draggedIssue: OnedevIssue | null;
	onDragStart: (issue: OnedevIssue) => void;
	onDrop: (targetState: string) => void;
}) {
	const navigate = useNavigate();
	const [isDragOver, setIsDragOver] = useState(false);

	const dropHandlers = {
		onDragOver: (e: React.DragEvent) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			if (!isDragOver) setIsDragOver(true);
		},
		onDragLeave: (e: React.DragEvent) => {
			// Only leave if actually leaving the column (not entering a child)
			const rect = e.currentTarget.getBoundingClientRect();
			const { clientX, clientY } = e;
			if (
				clientX < rect.left ||
				clientX > rect.right ||
				clientY < rect.top ||
				clientY > rect.bottom
			) {
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
				isDragOver
					? "border-primary/50 bg-accent/20"
					: "border-transparent"
			}`}
			{...dropHandlers}
		>
			<div className="flex items-center gap-2 px-2 py-2 mb-2">
				<VscIssues className={`size-4 ${stateColor(state)}`} />
				<span className="text-sm font-medium">{state}</span>
				<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
					{issues.length}
				</span>
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
							onClick={() =>
								navigate({
									to: "/tasks/onedev/$projectPath/$issueNumber",
									params: {
										projectPath: encodeURIComponent(projectPath),
										issueNumber: String(issue.number),
									},
								})
							}
							className={`text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-grab active:cursor-grabbing ${
								draggedIssue?.id === issue.id ? "opacity-50" : ""
							}`}
						>
							<div className="flex items-center gap-2 mb-1">
								<span className="text-xs text-muted-foreground tabular-nums">
									{slug}
								</span>
							</div>
							<p className="text-sm font-medium line-clamp-2">
								{issue.title}
							</p>
						</div>
					);
				})}
				{issues.length === 0 && (
					<div className="text-xs text-muted-foreground text-center py-4">
						No issues
					</div>
				)}
			</div>
		</div>
	);
}

function ListView({
	issues,
	projectKey,
	projectPath,
}: {
	issues: OnedevIssue[];
	projectKey: string;
	projectPath: string;
}) {
	const navigate = useNavigate();

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="flex items-center justify-between px-4 py-3 bg-muted/30">
				<div className="flex items-center gap-2">
					<h3 className="text-sm font-medium">{projectPath}</h3>
					<span className="text-xs text-muted-foreground">
						{issues.length} issues
					</span>
				</div>
			</div>
			{issues.length === 0 ? (
				<div className="px-4 py-6 text-center text-sm text-muted-foreground">
					No issues found
				</div>
			) : (
				<div className="divide-y divide-border">
					{issues.map((issue) => {
						const slug = `${projectKey.toLowerCase()}-${issue.number}`;
						const date = new Date(issue.submitDate);
						const dateStr = date.toLocaleDateString("de-DE", {
							day: "2-digit",
							month: "2-digit",
						});

						return (
							<button
								key={issue.id}
								type="button"
								className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer w-full text-left"
								onClick={() =>
									navigate({
										to: "/tasks/onedev/$projectPath/$issueNumber",
										params: {
											projectPath: encodeURIComponent(projectPath),
											issueNumber: String(issue.number),
										},
									})
								}
							>
								<VscIssues
									className={`size-4 shrink-0 ${stateColor(issue.state)}`}
								/>
								<span className="text-xs text-muted-foreground tabular-nums shrink-0 w-20">
									{slug}
								</span>
								<span className="text-sm truncate flex-1">{issue.title}</span>
								<span className="text-xs text-muted-foreground shrink-0 px-2 py-0.5 rounded bg-muted">
									{issue.state}
								</span>
								<span className="text-xs text-muted-foreground shrink-0 tabular-nums">
									{dateStr}
								</span>
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
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectPaths: string[];
}) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [selectedProject, setSelectedProject] = useState(projectPaths[0] ?? "");
	const utils = electronTrpc.useUtils();
	const createIssue = electronTrpc.settings.createOnedevIssue.useMutation({
		onSuccess: () => {
			utils.settings.getOnedevIssues.invalidate();
			toast.success("Issue created");
			setTitle("");
			setDescription("");
			onOpenChange(false);
		},
		onError: (err) => {
			toast.error(err.message);
		},
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
								<option key={p} value={p}>
									{p}
								</option>
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
								createIssue.mutate({
									projectPath: selectedProject,
									title: title.trim(),
									description: description.trim() || undefined,
								});
							}
						}}
					/>
					<Textarea
						placeholder="Description (optional)"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={4}
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={!title.trim() || createIssue.isPending}
						onClick={() =>
							createIssue.mutate({
								projectPath: selectedProject,
								title: title.trim(),
								description: description.trim() || undefined,
							})
						}
					>
						{createIssue.isPending ? "Creating..." : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
