import { Button } from "@superset/ui/button";
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

export function OnedevTasksContent({ searchQuery }: { searchQuery: string }) {
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
		<div className="flex-1 overflow-y-auto">
			{onedevProjectPaths.map((path) => (
				<OnedevProjectSection
					key={path}
					projectPath={path}
					searchQuery={searchQuery}
					onedevUrl={onedevConfig?.url ?? ""}
				/>
			))}
		</div>
	);
}

function OnedevProjectSection({
	projectPath,
	searchQuery,
	onedevUrl,
}: {
	projectPath: string;
	searchQuery: string;
	onedevUrl: string;
}) {
	const [stateFilter, setStateFilter] = useState<"open" | "closed">("open");

	const { data, isLoading } = electronTrpc.settings.getOnedevIssues.useQuery({
		projectPath,
		stateFilter,
	});

	// Find the local project ID for this OneDev project
	const { data: projects } = electronTrpc.projects.getRecents.useQuery();
	const localProject = useMemo(() => {
		if (!projects) return null;
		// Match by checking each project's git provider
		return projects[0] ?? null; // For now use first project — will be refined
	}, [projects]);

	const issues = useMemo(() => {
		const all = data?.issues ?? [];
		if (!searchQuery.trim()) return all;
		const q = searchQuery.toLowerCase();
		const key = data?.projectKey?.toLowerCase() ?? "";
		return all.filter((issue) => {
			const slug = `${key}-${issue.number}`;
			return (
				slug.includes(q) ||
				issue.title.toLowerCase().includes(q) ||
				issue.description?.toLowerCase().includes(q)
			);
		});
	}, [data, searchQuery]);

	const projectKey = data?.projectKey ?? projectPath;

	return (
		<div className="border-b border-border last:border-b-0">
			<div className="flex items-center justify-between px-4 py-3 bg-muted/30">
				<div className="flex items-center gap-2">
					<h3 className="text-sm font-medium">{projectPath}</h3>
					<span className="text-xs text-muted-foreground">
						{issues.length} issues
					</span>
				</div>
				<div className="flex gap-1">
					<button
						type="button"
						onClick={() => setStateFilter("open")}
						className={`text-xs px-2 py-0.5 rounded ${
							stateFilter === "open"
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Open
					</button>
					<button
						type="button"
						onClick={() => setStateFilter("closed")}
						className={`text-xs px-2 py-0.5 rounded ${
							stateFilter === "closed"
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Closed
					</button>
				</div>
			</div>

			{isLoading ? (
				<div className="px-4 py-6 text-center text-sm text-muted-foreground">
					Loading issues...
				</div>
			) : issues.length === 0 ? (
				<div className="px-4 py-6 text-center text-sm text-muted-foreground">
					No {stateFilter} issues
				</div>
			) : (
				<div className="divide-y divide-border">
					{issues.map((issue) => (
						<OnedevIssueRow
							key={issue.id}
							issue={issue}
							projectKey={projectKey}
							projectPath={projectPath}
							onedevUrl={onedevUrl}
							localProjectId={localProject?.id ?? null}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function OnedevIssueRow({
	issue,
	projectKey,
	projectPath,
}: {
	issue: OnedevIssue;
	projectKey: string;
	projectPath: string;
	onedevUrl: string;
	localProjectId: string | null;
}) {
	const navigate = useNavigate();
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

	const handleClick = () => {
		navigate({
			to: "/tasks/onedev/$projectPath/$issueNumber",
			params: {
				projectPath: encodeURIComponent(projectPath),
				issueNumber: String(issue.number),
			},
		});
	};

	return (
		<button
			type="button"
			className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer w-full text-left"
			onClick={handleClick}
		>
			<VscIssues className={`size-4 shrink-0 ${stateColor}`} />
			<span className="text-xs text-muted-foreground tabular-nums shrink-0 w-20">
				{slug}
			</span>
			<span className="text-sm truncate flex-1">{issue.title}</span>
			<span className="text-xs text-muted-foreground shrink-0 tabular-nums">
				{dateStr}
			</span>
			{issue.commentCount > 0 && (
				<span className="text-xs text-muted-foreground shrink-0">
					{issue.commentCount}
				</span>
			)}
		</button>
	);
}
