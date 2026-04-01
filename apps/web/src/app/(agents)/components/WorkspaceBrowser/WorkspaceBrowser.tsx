"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type {
	MockProject,
	MockSession,
	MockWorkspace,
} from "../../mock-data";
import { WorkspaceCard } from "./components/WorkspaceCard";

type WorkspaceBrowserProps = {
	projects: MockProject[];
	sessions: MockSession[];
	workspaces: MockWorkspace[];
};

type WorkspaceGroup = {
	project: MockProject;
	workspaces: Array<{
		lastActiveAt: Date | null;
		sessionCount: number;
		workspace: MockWorkspace;
	}>;
};

export function WorkspaceBrowser({
	projects,
	sessions,
	workspaces,
}: WorkspaceBrowserProps) {
	const [search, setSearch] = useState("");
	const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

	const workspaceGroups = useMemo<WorkspaceGroup[]>(() => {
		const searchQuery = search.trim().toLowerCase();

		return projects
			.filter(
				(project) =>
					selectedProjectId === "all" || project.id === selectedProjectId,
			)
			.map((project) => {
				const projectWorkspaces = workspaces
					.filter((workspace) => workspace.projectId === project.id)
					.map((workspace) => {
						const workspaceSessions = sessions.filter(
							(session) => session.workspaceId === workspace.id,
						);
						const sortedSessionDates = workspaceSessions
							.map((session) => session.createdAt)
							.sort((left, right) => right.getTime() - left.getTime());

						return {
							lastActiveAt: sortedSessionDates[0] ?? null,
							sessionCount: workspaceSessions.length,
							workspace,
						};
					})
					.filter(({ workspace }) => {
						if (!searchQuery) {
							return true;
						}

						return (
							workspace.name.toLowerCase().includes(searchQuery) ||
							workspace.repoFullName.toLowerCase().includes(searchQuery) ||
							workspace.branch.toLowerCase().includes(searchQuery)
						);
					})
					.sort((left, right) => {
						if (left.lastActiveAt && right.lastActiveAt) {
							return right.lastActiveAt.getTime() - left.lastActiveAt.getTime();
						}

						if (left.lastActiveAt) {
							return -1;
						}

						if (right.lastActiveAt) {
							return 1;
						}

						return left.workspace.name.localeCompare(right.workspace.name);
					});

				return {
					project,
					workspaces: projectWorkspaces,
				};
			})
			.filter((group) => group.workspaces.length > 0);
	}, [projects, search, selectedProjectId, sessions, workspaces]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2 overflow-x-auto px-1 pb-1">
				<button
					type="button"
					onClick={() => setSelectedProjectId("all")}
					className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
						selectedProjectId === "all"
							? "border-foreground bg-foreground text-background"
							: "border-border bg-background text-muted-foreground hover:text-foreground"
					}`}
				>
					All projects
				</button>
				{projects.map((project) => (
					<button
						key={project.id}
						type="button"
						onClick={() => setSelectedProjectId(project.id)}
						className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
							selectedProjectId === project.id
								? "border-foreground bg-foreground text-background"
								: "border-border bg-background text-muted-foreground hover:text-foreground"
						}`}
					>
						{project.name}
					</button>
				))}
			</div>

			<div className="relative">
				<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search workspaces..."
					aria-label="Search workspaces"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>

			{workspaceGroups.length === 0 ? (
				<p className="py-12 text-center text-sm text-muted-foreground">
					No workspaces found
				</p>
			) : (
				<div className="flex flex-col gap-5">
					{workspaceGroups.map((group) => (
						<section key={group.project.id} className="flex flex-col gap-2">
							<div className="flex items-center justify-between px-1">
								<div className="flex flex-col">
									<h2 className="text-sm font-medium">{group.project.name}</h2>
									<p className="text-xs text-muted-foreground">
										{group.project.repoFullName}
									</p>
								</div>
								<span className="text-xs text-muted-foreground">
									{group.workspaces.length} workspace
									{group.workspaces.length === 1 ? "" : "s"}
								</span>
							</div>
							<div className="flex flex-col gap-2">
								{group.workspaces.map((workspaceItem) => (
									<WorkspaceCard
										key={workspaceItem.workspace.id}
										lastActiveAt={workspaceItem.lastActiveAt}
										project={group.project}
										sessionCount={workspaceItem.sessionCount}
										workspace={workspaceItem.workspace}
									/>
								))}
							</div>
						</section>
					))}
				</div>
			)}
		</div>
	);
}
