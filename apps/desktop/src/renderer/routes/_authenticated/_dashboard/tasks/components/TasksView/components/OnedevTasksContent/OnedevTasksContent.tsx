import { Button } from "@superset/ui/button";
import { ScrollArea, ScrollBar } from "@superset/ui/scroll-area";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
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

const KANBAN_COLUMNS = ["Open", "In Progress", "Closed"] as const;

export function OnedevTasksContent({
	searchQuery,
	viewMode,
}: { searchQuery: string; viewMode: "table" | "board" }) {
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
		<div className="flex-1 overflow-hidden">
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
	// Fetch ALL issues (no state filter) for both views, auto-refresh every 30s
	const { data, isLoading } = electronTrpc.settings.getOnedevIssues.useQuery(
		{ projectPath },
		{ refetchInterval: 30000 },
	);

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
}: {
	issues: OnedevIssue[];
	projectKey: string;
	projectPath: string;
}) {
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
		<ScrollArea className="flex-1 h-full">
			<div className="flex gap-4 p-4 h-full min-w-max">
				{KANBAN_COLUMNS.map((state) => (
					<KanbanColumn
						key={state}
						state={state}
						issues={issuesByState[state] ?? []}
						projectKey={projectKey}
						projectPath={projectPath}
					/>
				))}
			</div>
			<ScrollBar orientation="horizontal" />
		</ScrollArea>
	);
}

function KanbanColumn({
	state,
	issues,
	projectKey,
	projectPath,
}: {
	state: string;
	issues: OnedevIssue[];
	projectKey: string;
	projectPath: string;
}) {
	const navigate = useNavigate();

	const stateColor =
		state === "Open"
			? "text-green-500"
			: state === "In Progress"
				? "text-blue-500"
				: "text-muted-foreground";

	return (
		<div className="w-72 shrink-0 flex flex-col">
			<div className="flex items-center gap-2 px-2 py-2 mb-2">
				<VscIssues className={`size-4 ${stateColor}`} />
				<span className="text-sm font-medium">{state}</span>
				<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
					{issues.length}
				</span>
			</div>
			<div className="flex flex-col gap-2 flex-1 overflow-y-auto">
				{issues.map((issue) => {
					const slug = `${projectKey.toLowerCase()}-${issue.number}`;
					return (
						<button
							key={issue.id}
							type="button"
							className="text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
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
							<div className="flex items-center gap-2 mb-1">
								<span className="text-xs text-muted-foreground tabular-nums">
									{slug}
								</span>
							</div>
							<p className="text-sm font-medium line-clamp-2">
								{issue.title}
							</p>
							{issue.commentCount > 0 && (
								<span className="text-xs text-muted-foreground mt-1 inline-block">
									{issue.commentCount} comments
								</span>
							)}
						</button>
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
						const stateColor =
							issue.state === "Open"
								? "text-green-500"
								: issue.state === "In Progress"
									? "text-blue-500"
									: "text-muted-foreground";
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
								<VscIssues className={`size-4 shrink-0 ${stateColor}`} />
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
