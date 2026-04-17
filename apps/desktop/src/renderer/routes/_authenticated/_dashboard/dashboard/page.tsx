import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	HiArrowTopRightOnSquare,
	HiChevronRight,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineExclamationCircle,
} from "react-icons/hi2";
import {
	VscCloudDownload,
	VscGitCommit,
	VscGitMerge,
	VscGitPullRequest,
	VscIssues,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CreateOnedevIssueDialog } from "../tasks/components/TasksView/components/OnedevTasksContent";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/")({
	component: DashboardPage,
});

function DashboardPage() {
	const { data: onedevConfig } =
		electronTrpc.settings.getOnedevConfig.useQuery();
	const { data: projectPaths = [], isLoading } =
		electronTrpc.workspaces.getOnedevProjectPaths.useQuery();
	const isConfigured = !!onedevConfig?.url && !!onedevConfig?.accessToken;
	const onedevUrl = onedevConfig?.url ?? "";

	const { data: allOnedevProjects = [] } =
		electronTrpc.settings.getAllOnedevProjects.useQuery(undefined, {
			enabled: isConfigured,
			refetchInterval: 120000,
		});
	const { data: projectsBaseDir } =
		electronTrpc.settings.getProjectsBaseDir.useQuery();

	const remoteOnlyProjects = useMemo(() => {
		const localPathSet = new Set(projectPaths.map((p) => p.toLowerCase()));
		return allOnedevProjects.filter(
			(p) => !localPathSet.has(p.path.toLowerCase()),
		);
	}, [allOnedevProjects, projectPaths]);

	if (!isConfigured) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">
					Configure OneDev in Settings &gt; Git to view the dashboard.
				</p>
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

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="px-6 py-4 border-b border-border">
				<h1 className="text-lg font-semibold">OneDev Dashboard</h1>
				<p className="text-xs text-muted-foreground mt-1">
					{projectPaths.length} projects connected
				</p>
			</div>
			<div className="p-6 flex flex-col gap-6">
				{projectPaths.map((path) => (
					<ProjectCard key={path} projectPath={path} onedevUrl={onedevUrl} />
				))}

				{remoteOnlyProjects.length > 0 && (
					<div className="border-t border-border pt-6">
						<div className="flex items-center justify-between mb-4">
							<div>
								<h2 className="text-sm font-semibold">Available Projects</h2>
								<p className="text-xs text-muted-foreground mt-0.5">
									{remoteOnlyProjects.length} projects on OneDev not yet cloned
									locally
								</p>
							</div>
						</div>
						{!projectsBaseDir && (
							<p className="text-xs text-muted-foreground mb-3">
								Set a{" "}
								<Link
									to="/settings/git"
									className="underline hover:text-foreground"
								>
									projects directory
								</Link>{" "}
								in Settings &gt; Git to subscribe to projects.
							</p>
						)}
						<div className="flex flex-col gap-2">
							{remoteOnlyProjects.map((project) => (
								<RemoteProjectCard
									key={project.id}
									project={project}
									onedevUrl={onedevUrl}
									onedevToken={onedevConfig?.accessToken ?? ""}
									projectsBaseDir={projectsBaseDir}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function BuildStatusIcon({ status }: { status: string }) {
	if (status === "SUCCESSFUL")
		return (
			<HiOutlineCheckCircle className="size-3.5 text-green-500 shrink-0" />
		);
	if (status === "FAILED")
		return (
			<HiOutlineExclamationCircle className="size-3.5 text-red-500 shrink-0" />
		);
	if (status === "RUNNING")
		return (
			<HiOutlineClock className="size-3.5 text-blue-500 shrink-0 animate-spin" />
		);
	return <HiOutlineClock className="size-3.5 text-yellow-500 shrink-0" />;
}

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function ProjectCard({
	projectPath,
	onedevUrl,
}: {
	projectPath: string;
	onedevUrl: string;
}) {
	const navigate = useNavigate();
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const { data: issuesData } = electronTrpc.settings.getOnedevIssues.useQuery(
		{ projectPath },
		{ refetchInterval: 60000 },
	);
	const { data: builds = [] } = electronTrpc.settings.getOnedevBuilds.useQuery(
		{ projectPath },
		{ refetchInterval: 60000 },
	);
	const { data: prs = [] } =
		electronTrpc.settings.getOnedevPullRequests.useQuery(
			{ projectPath },
			{ refetchInterval: 60000 },
		);
	const { data: commitData } =
		electronTrpc.settings.getOnedevRecentCommits.useQuery(
			{ projectPath },
			{ refetchInterval: 60000 },
		);
	const commits = commitData?.commits ?? [];
	const totalCommits = commitData?.totalCount ?? 0;
	const contributors = commitData?.contributors ?? [];

	const issues = issuesData?.issues ?? [];
	const projectKey = issuesData?.projectKey ?? projectPath;

	const issueCounts = useMemo(() => {
		const open = issues.filter((i) => i.state === "Open").length;
		const inProgress = issues.filter((i) => i.state === "In Progress").length;
		const inReview = issues.filter((i) => i.state === "In Review").length;
		return { open, inProgress, inReview };
	}, [issues]);

	const openPRs = prs.filter((p) => p.status === "OPEN");
	const mergedPRs = prs.filter((p) => p.status === "MERGED");

	// Group builds by job name
	const buildsByJob = useMemo(() => {
		const map = new Map<string, typeof builds>();
		for (const build of builds) {
			const existing = map.get(build.jobName) ?? [];
			existing.push(build);
			map.set(build.jobName, existing);
		}
		return map;
	}, [builds]);

	return (
		<div className="border border-border rounded-lg overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
				<button
					type="button"
					onClick={() => setIsCollapsed(!isCollapsed)}
					className="flex items-center gap-2 min-w-0 hover:text-foreground transition-colors"
				>
					<HiChevronRight
						className={`size-3.5 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`}
					/>
					{projectKey !== projectPath && (
						<span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
							{projectKey}
						</span>
					)}
					<span className="text-sm font-semibold">{projectPath}</span>
				</button>
				{/* Summary counts */}
				<div className="flex items-center gap-3 text-[10px] text-muted-foreground">
					<span>
						{issues.length} issues (
						{issues.filter((i) => i.state !== "Closed").length} active)
					</span>
					<span>
						{prs.length} PRs ({openPRs.length} open)
					</span>
					<span>{builds.length} builds</span>
					<span>{totalCommits} commits</span>
				</div>
				{/* Contributors (from git history, per project) */}
				{contributors.length > 0 && (
					<div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
						{contributors.map((name) => (
							<span key={name} className="px-1.5 py-0.5 rounded bg-muted">
								{name}
							</span>
						))}
					</div>
				)}
				<a
					href={`${onedevUrl}/${projectPath}`}
					target="_blank"
					rel="noopener noreferrer"
					className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
				>
					<HiArrowTopRightOnSquare className="size-3.5" />
				</a>
			</div>

			{!isCollapsed && (
				<div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
					{/* Issues */}
					<div className="px-4 py-3">
						<div className="flex items-center gap-1.5 mb-2.5">
							<VscIssues className="size-3.5 text-muted-foreground" />
							<span className="text-xs font-medium text-muted-foreground">
								Issues
							</span>
							{issueCounts.open +
								issueCounts.inProgress +
								issueCounts.inReview >
								0 && (
								<span className="text-[10px] text-muted-foreground">
									{issueCounts.open +
										issueCounts.inProgress +
										issueCounts.inReview}{" "}
									active
								</span>
							)}
							<button
								type="button"
								onClick={() => setIsCreateOpen(true)}
								className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
							>
								+ New
							</button>
						</div>
						<div className="flex flex-col gap-1.5">
							{issues
								.filter((i) => i.state !== "Closed")
								.slice(0, 5)
								.map((issue) => {
									const slug = `${(projectKey ?? projectPath).toLowerCase()}-${issue.number}`;
									const stateColor =
										issue.state === "Open"
											? "bg-green-500"
											: issue.state === "In Progress"
												? "bg-blue-500"
												: "bg-yellow-500";
									return (
										<button
											key={issue.id}
											type="button"
											onClick={() =>
												navigate({
													to: "/tasks/onedev/$projectPath/$issueNumber",
													params: {
														projectPath: encodeURIComponent(projectPath),
														issueNumber: String(issue.number),
													},
												})
											}
											className="flex items-center gap-1.5 text-xs text-left hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors"
										>
											<span
												className={`inline-block w-2 h-2 rounded-full ${stateColor} shrink-0`}
											/>
											<span className="text-muted-foreground shrink-0">
												{slug}
											</span>
											<span className="truncate">{issue.title}</span>
										</button>
									);
								})}
							{issues.filter((i) => i.state !== "Closed").length === 0 && (
								<span className="text-xs text-muted-foreground">
									No active issues
								</span>
							)}
						</div>
					</div>

					{/* Pull Requests */}
					<div className="px-4 py-3">
						<div className="flex items-center gap-1.5 mb-2.5">
							<VscGitPullRequest className="size-3.5 text-muted-foreground" />
							<span className="text-xs font-medium text-muted-foreground">
								Pull Requests
							</span>
						</div>
						<div className="flex flex-col gap-1.5">
							{openPRs.map((pr) => (
								<a
									key={pr.id}
									href={pr.url}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors group"
								>
									<VscGitPullRequest className="size-3 text-green-500 shrink-0" />
									<span className="text-muted-foreground shrink-0">
										#{pr.number}
									</span>
									<span className="truncate group-hover:text-foreground">
										{pr.title}
									</span>
								</a>
							))}
							{mergedPRs.length > 0 && (
								<span className="text-xs text-muted-foreground">
									{mergedPRs.length} merged
								</span>
							)}
							{prs.length === 0 && (
								<span className="text-xs text-muted-foreground">No PRs</span>
							)}
						</div>
					</div>

					{/* Builds by Job */}
					<div className="px-4 py-3">
						<div className="flex items-center gap-1.5 mb-2.5">
							<VscGitMerge className="size-3.5 text-muted-foreground" />
							<span className="text-xs font-medium text-muted-foreground">
								Builds
							</span>
						</div>
						<div className="flex flex-col gap-2">
							{[...buildsByJob.entries()].map(([jobName, jobBuilds]) => {
								const latest = jobBuilds[0];
								if (!latest) return null;
								return (
									<a
										key={jobName}
										href={`${onedevUrl}/${projectPath}/~builds/${latest.id}`}
										target="_blank"
										rel="noopener noreferrer"
										className="flex flex-col gap-0.5 hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors"
									>
										<div className="flex items-center gap-1.5">
											<BuildStatusIcon status={latest.status} />
											<span className="text-xs font-medium truncate">
												{jobName}
											</span>
										</div>
										<span className="text-[10px] text-muted-foreground ml-5">
											#{latest.number} · {latest.commitHash} ·{" "}
											{timeAgo(latest.submitDate)}
										</span>
									</a>
								);
							})}
							{builds.length === 0 && (
								<span className="text-xs text-muted-foreground">No builds</span>
							)}
						</div>
					</div>

					{/* Recent Commits */}
					<div className="px-4 py-3">
						<div className="flex items-center gap-1.5 mb-2.5">
							<VscGitCommit className="size-3.5 text-muted-foreground" />
							<span className="text-xs font-medium text-muted-foreground">
								Recent Commits
							</span>
						</div>
						<div className="flex flex-col gap-2">
							{commits.slice(0, 5).map((commit) => (
								<a
									key={commit.hash}
									href={`${onedevUrl}/${projectPath}/~commits/${commit.hash}`}
									target="_blank"
									rel="noopener noreferrer"
									className="flex flex-col gap-0.5 hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors"
								>
									<div className="flex items-center gap-1.5 text-xs">
										<span className="font-mono text-muted-foreground shrink-0">
											{commit.hash}
										</span>
										<span className="truncate">{commit.message}</span>
									</div>
									<span className="text-[10px] text-muted-foreground ml-[52px]">
										{commit.author} · {timeAgo(commit.date)}
									</span>
								</a>
							))}
							{commits.length === 0 && (
								<span className="text-xs text-muted-foreground">
									No commits
								</span>
							)}
						</div>
					</div>
				</div>
			)}
			<CreateOnedevIssueDialog
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				projectPaths={[projectPath]}
				initialProject={projectPath}
			/>
		</div>
	);
}

interface RemoteProject {
	id: number;
	name: string;
	path: string;
}

function RemoteProjectCard({
	project,
	onedevUrl,
	onedevToken,
	projectsBaseDir,
}: {
	project: RemoteProject;
	onedevUrl: string;
	onedevToken: string;
	projectsBaseDir: string | null | undefined;
}) {
	const utils = electronTrpc.useUtils();
	const [error, setError] = useState<string | null>(null);

	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation({
		onSuccess: (result) => {
			if (result.success) {
				setError(null);
				utils.workspaces.getOnedevProjectPaths.invalidate();
				utils.settings.getAllOnedevProjects.invalidate();
				utils.projects.getRecents.invalidate();
			} else if (!result.canceled && result.error) {
				setError(result.error);
			}
		},
		onError: (err) => {
			setError(err.message);
		},
	});

	const handleSubscribe = () => {
		setError(null);
		const host = new URL(onedevUrl).host;
		const cloneUrl = `https://${onedevToken}@${host}/${project.path}.git`;
		cloneRepo.mutate({
			url: cloneUrl,
			targetDirectory: projectsBaseDir ?? undefined,
		});
	};

	return (
		<div className="border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
			<div className="flex items-center gap-2 min-w-0">
				<VscCloudDownload className="size-4 text-muted-foreground shrink-0" />
				<div className="min-w-0">
					<span className="text-sm font-medium">{project.name}</span>
					<span className="text-xs text-muted-foreground ml-2">
						{project.path}
					</span>
					{error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
				</div>
			</div>
			<button
				type="button"
				className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
				onClick={handleSubscribe}
				disabled={cloneRepo.isPending}
			>
				{cloneRepo.isPending ? "Cloning..." : "Subscribe"}
			</button>
		</div>
	);
}
