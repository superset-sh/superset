import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	HiArrowTopRightOnSquare,
	HiChevronRight,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineExclamationCircle,
} from "react-icons/hi2";
import {
	VscGitCommit,
	VscGitMerge,
	VscGitPullRequest,
	VscIssues,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/")({
	component: DashboardPage,
});

function DashboardPage() {
	const { data: onedevConfig } = electronTrpc.settings.getOnedevConfig.useQuery();
	const { data: projectPaths = [], isLoading } = electronTrpc.workspaces.getOnedevProjectPaths.useQuery();
	const isConfigured = !!onedevConfig?.url && !!onedevConfig?.accessToken;
	const onedevUrl = onedevConfig?.url ?? "";

	if (!isConfigured) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">Configure OneDev in Settings &gt; Git to view the dashboard.</p>
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
				<p className="text-xs text-muted-foreground mt-1">{projectPaths.length} projects connected</p>
			</div>
			<div className="p-6 flex flex-col gap-6">
				{projectPaths.map((path) => (
					<ProjectCard key={path} projectPath={path} onedevUrl={onedevUrl} />
				))}
			</div>
		</div>
	);
}

function BuildStatusIcon({ status }: { status: string }) {
	if (status === "SUCCESSFUL") return <HiOutlineCheckCircle className="size-3.5 text-green-500 shrink-0" />;
	if (status === "FAILED") return <HiOutlineExclamationCircle className="size-3.5 text-red-500 shrink-0" />;
	if (status === "RUNNING") return <HiOutlineClock className="size-3.5 text-blue-500 shrink-0 animate-spin" />;
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

function ProjectCard({ projectPath, onedevUrl }: { projectPath: string; onedevUrl: string }) {
	const navigate = useNavigate();
	const [isCollapsed, setIsCollapsed] = useState(false);
	const { data: issuesData } = electronTrpc.settings.getOnedevIssues.useQuery({ projectPath }, { refetchInterval: 60000 });
	const { data: builds = [] } = electronTrpc.settings.getOnedevBuilds.useQuery({ projectPath }, { refetchInterval: 60000 });
	const { data: prs = [] } = electronTrpc.settings.getOnedevPullRequests.useQuery({ projectPath }, { refetchInterval: 60000 });
	const { data: commits = [] } = electronTrpc.settings.getOnedevRecentCommits.useQuery({ projectPath }, { refetchInterval: 60000 });

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
					<HiChevronRight className={`size-3.5 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
					{projectKey !== projectPath && (
						<span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{projectKey}</span>
					)}
					<span className="text-sm font-semibold">{projectPath}</span>
				</button>
				<a
					href={`${onedevUrl}/${projectPath}`}
					target="_blank"
					rel="noopener noreferrer"
					className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
				>
					<HiArrowTopRightOnSquare className="size-3.5" />
				</a>
			</div>

			{!isCollapsed && <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
				{/* Issues */}
				<div className="px-4 py-3">
					<div className="flex items-center gap-1.5 mb-2.5">
						<VscIssues className="size-3.5 text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">Issues</span>
						{(issueCounts.open + issueCounts.inProgress + issueCounts.inReview) > 0 && (
							<span className="text-[10px] text-muted-foreground ml-auto">{issueCounts.open + issueCounts.inProgress + issueCounts.inReview} active</span>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						{issues.filter((i) => i.state !== "Closed").slice(0, 5).map((issue) => {
							const slug = `${(projectKey ?? projectPath).toLowerCase()}-${issue.number}`;
							const stateColor = issue.state === "Open" ? "bg-green-500" : issue.state === "In Progress" ? "bg-blue-500" : "bg-yellow-500";
							return (
								<button
									key={issue.id}
									type="button"
									onClick={() => navigate({
										to: "/tasks/onedev/$projectPath/$issueNumber",
										params: { projectPath: encodeURIComponent(projectPath), issueNumber: String(issue.number) },
									})}
									className="flex items-center gap-1.5 text-xs text-left hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors"
								>
									<span className={`inline-block w-2 h-2 rounded-full ${stateColor} shrink-0`} />
									<span className="text-muted-foreground shrink-0">{slug}</span>
									<span className="truncate">{issue.title}</span>
								</button>
							);
						})}
						{issues.filter((i) => i.state !== "Closed").length === 0 && (
							<span className="text-xs text-muted-foreground">No active issues</span>
						)}
					</div>
				</div>

				{/* Pull Requests */}
				<div className="px-4 py-3">
					<div className="flex items-center gap-1.5 mb-2.5">
						<VscGitPullRequest className="size-3.5 text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">Pull Requests</span>
					</div>
					<div className="flex flex-col gap-1.5">
						{openPRs.map((pr) => (
							<a key={pr.id} href={pr.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors group">
								<VscGitPullRequest className="size-3 text-green-500 shrink-0" />
								<span className="text-muted-foreground shrink-0">#{pr.number}</span>
								<span className="truncate group-hover:text-foreground">{pr.title}</span>
							</a>
						))}
						{mergedPRs.length > 0 && (
							<span className="text-xs text-muted-foreground">{mergedPRs.length} merged</span>
						)}
						{prs.length === 0 && <span className="text-xs text-muted-foreground">No PRs</span>}
					</div>
				</div>

				{/* Builds by Job */}
				<div className="px-4 py-3">
					<div className="flex items-center gap-1.5 mb-2.5">
						<VscGitMerge className="size-3.5 text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">Builds</span>
					</div>
					<div className="flex flex-col gap-2">
					{[...buildsByJob.entries()].map(([jobName, jobBuilds]) => {
							const latest = jobBuilds[0];
							if (!latest) return null;
							return (
								<a key={jobName} href={`${onedevUrl}/${projectPath}/~builds/${latest.id}`} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-0.5 hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors">
									<div className="flex items-center gap-1.5">
										<BuildStatusIcon status={latest.status} />
										<span className="text-xs font-medium truncate">{jobName}</span>
									</div>
									<span className="text-[10px] text-muted-foreground ml-5">
										#{latest.number} · {latest.commitHash} · {timeAgo(latest.submitDate)}
									</span>
								</a>
							);
						})}
						{builds.length === 0 && <span className="text-xs text-muted-foreground">No builds</span>}
					</div>
				</div>

				{/* Recent Commits */}
				<div className="px-4 py-3">
					<div className="flex items-center gap-1.5 mb-2.5">
						<VscGitCommit className="size-3.5 text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">Recent Commits</span>
					</div>
					<div className="flex flex-col gap-2">
						{commits.slice(0, 5).map((commit) => (
							<a key={commit.hash} href={`${onedevUrl}/${projectPath}/~commits/${commit.hash}`} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-0.5 hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors">
								<div className="flex items-center gap-1.5 text-xs">
									<span className="font-mono text-muted-foreground shrink-0">{commit.hash}</span>
									<span className="truncate">{commit.message}</span>
								</div>
								<span className="text-[10px] text-muted-foreground ml-[52px]">
									{commit.author} · {timeAgo(commit.date)}
								</span>
							</a>
						))}
						{commits.length === 0 && <span className="text-xs text-muted-foreground">No commits</span>}
					</div>
				</div>
			</div>}
		</div>
	);
}
