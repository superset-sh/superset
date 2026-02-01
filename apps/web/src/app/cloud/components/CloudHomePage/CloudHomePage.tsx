"use client";

import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
	LuChevronDown,
	LuGithub,
	LuLoader,
	LuLock,
	LuPaperclip,
	LuPlus,
	LuSend,
} from "react-icons/lu";

import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

function _SupersetIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 64 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Superset"
			className={className}
		>
			<path
				d="M25.2727 0H37.9091V12.6364H25.2727V0ZM12.6364 0H25.2727V12.6364H12.6364V0ZM0 12.6364H12.6364V25.2727H0V12.6364ZM0 25.2727H12.6364V37.9091H0V25.2727ZM12.6364 25.2727H25.2727V37.9091H12.6364V25.2727ZM25.2727 25.2727H37.9091V37.9091H25.2727V25.2727ZM25.2727 37.9091H37.9091V50.5455H25.2727V37.9091ZM25.2727 50.5455H37.9091V63.1818H25.2727V50.5455ZM12.6364 50.5455H25.2727V63.1818H12.6364V50.5455ZM0 50.5455H12.6364V63.1818H0V50.5455ZM0 0H12.6364V12.6364H0V0Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function SupersetLogo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 392 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Superset"
			className={className}
		>
			<path
				d="M25.2727 -0.00017944H37.9091V12.6362H25.2727V-0.00017944ZM12.6364 -0.00017944H25.2727V12.6362H12.6364V-0.00017944ZM0 12.6362H12.6364V25.2725H0V12.6362ZM0 25.2725H12.6364V37.9089H0V25.2725ZM12.6364 25.2725H25.2727V37.9089H12.6364V25.2725ZM25.2727 25.2725H37.9091V37.9089H25.2727V25.2725ZM25.2727 37.9089H37.9091V50.5453H25.2727V37.9089ZM25.2727 50.5453H37.9091V63.1816H25.2727V50.5453ZM12.6364 50.5453H25.2727V63.1816H12.6364V50.5453ZM0 50.5453H12.6364V63.1816H0V50.5453ZM0 -0.00017944H12.6364V12.6362H0V-0.00017944ZM50.4961 -0.00017944H63.1325V12.6362H50.4961V-0.00017944ZM50.4961 12.6362H63.1325V25.2725H50.4961V12.6362ZM50.4961 25.2725H63.1325V37.9089H50.4961V25.2725ZM50.4961 37.9089H63.1325V50.5453H50.4961V37.9089ZM50.4961 50.5453H63.1325V63.1816H50.4961V50.5453ZM63.1325 50.5453H75.7688V63.1816H63.1325V50.5453ZM75.7688 50.5453H88.4052V63.1816H75.7688V50.5453ZM75.7688 37.9089H88.4052V50.5453H75.7688V37.9089ZM75.7688 25.2725H88.4052V37.9089H75.7688V25.2725ZM75.7688 12.6362H88.4052V25.2725H75.7688V12.6362ZM75.7688 -0.00017944H88.4052V12.6362H75.7688V-0.00017944ZM100.992 -0.00017944H113.629V12.6362H100.992V-0.00017944ZM100.992 12.6362H113.629V25.2725H100.992V12.6362ZM100.992 25.2725H113.629V37.9089H100.992V25.2725ZM100.992 37.9089H113.629V50.5453H100.992V37.9089ZM100.992 50.5453H113.629V63.1816H100.992V50.5453ZM113.629 -0.00017944H126.265V12.6362H113.629V-0.00017944ZM126.265 -0.00017944H138.901V12.6362H126.265V-0.00017944ZM126.265 12.6362H138.901V25.2725H126.265V12.6362ZM126.265 25.2725H138.901V37.9089H126.265V25.2725ZM113.629 25.2725H126.265V37.9089H113.629V25.2725ZM151.488 -0.00017944H164.125V12.6362H151.488V-0.00017944ZM151.488 12.6362H164.125V25.2725H151.488V12.6362ZM151.488 25.2725H164.125V37.9089H151.488V25.2725ZM151.488 37.9089H164.125V50.5453H151.488V37.9089ZM151.488 50.5453H164.125V63.1816H151.488V50.5453ZM164.125 -0.00017944H176.761V12.6362H164.125V-0.00017944ZM164.125 50.5453H176.761V63.1816H164.125V50.5453ZM164.125 25.2725H176.761V37.9089H164.125V25.2725ZM176.761 -0.00017944H189.397V12.6362H176.761V-0.00017944ZM176.761 50.5453H189.397V63.1816H176.761V50.5453ZM201.984 50.5453H214.621V63.1816H201.984V50.5453ZM201.984 37.9089H214.621V50.5453H201.984V37.9089ZM201.984 25.2725H214.621V37.9089H201.984V25.2725ZM201.984 12.6362H214.621V25.2725H201.984V12.6362ZM201.984 -0.00017944H214.621V12.6362H201.984V-0.00017944ZM214.621 -0.00017944H227.257V12.6362H214.621V-0.00017944ZM227.257 -0.00017944H239.893V12.6362H227.257V-0.00017944ZM227.257 12.6362H239.893V25.2725H227.257V12.6362ZM214.621 25.2725H227.257V37.9089H214.621V25.2725ZM227.257 37.9089H239.893V50.5453H227.257V37.9089ZM227.257 50.5453H239.893V63.1816H227.257V50.5453ZM277.753 -0.00017944H290.39V12.6362H277.753V-0.00017944ZM265.117 -0.00017944H277.753V12.6362H265.117V-0.00017944ZM252.48 12.6362H265.117V25.2725H252.48V12.6362ZM252.48 25.2725H265.117V37.9089H252.48V25.2725ZM265.117 25.2725H277.753V37.9089H265.117V25.2725ZM277.753 25.2725H290.39V37.9089H277.753V25.2725ZM277.753 37.9089H290.39V50.5453H277.753V37.9089ZM277.753 50.5453H290.39V63.1816H277.753V50.5453ZM265.117 50.5453H277.753V63.1816H265.117V50.5453ZM252.48 50.5453H265.117V63.1816H252.48V50.5453ZM252.48 -0.00017944H265.117V12.6362H252.48V-0.00017944ZM302.977 -0.00017944H315.613V12.6362H302.977V-0.00017944ZM302.977 12.6362H315.613V25.2725H302.977V12.6362ZM302.977 25.2725H315.613V37.9089H302.977V25.2725ZM302.977 37.9089H315.613V50.5453H302.977V37.9089ZM302.977 50.5453H315.613V63.1816H302.977V50.5453ZM315.613 -0.00017944H328.249V12.6362H315.613V-0.00017944ZM315.613 50.5453H328.249V63.1816H315.613V50.5453ZM315.613 25.2725H328.249V37.9089H315.613V25.2725ZM328.249 -0.00017944H340.886V12.6362H328.249V-0.00017944ZM328.249 50.5453H340.886V63.1816H328.249V50.5453ZM353.473 -0.00017944H366.109V12.6362H353.473V-0.00017944ZM366.109 -0.00017944H378.745V12.6362H366.109V-0.00017944ZM378.745 -0.00017944H391.382V12.6362H378.745V-0.00017944ZM366.109 12.6362H378.745V25.2725H366.109V12.6362ZM366.109 25.2725H378.745V37.9089H366.109V25.2725ZM366.109 37.9089H378.745V50.5453H366.109V37.9089ZM366.109 50.5453H378.745V63.1816H366.109V50.5453Z"
				fill="currentColor"
			/>
		</svg>
	);
}

interface CloudWorkspace {
	id: string;
	sessionId: string;
	title: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	status: string;
	sandboxStatus: string | null;
	model: string | null;
	createdAt: Date;
	updatedAt: Date;
}

interface GitHubRepository {
	id: string;
	repoId: string;
	installationId: string;
	owner: string;
	name: string;
	fullName: string;
	defaultBranch: string;
	isPrivate: boolean;
	createdAt: Date;
	updatedAt: Date;
}

interface CloudHomePageProps {
	organizationId: string;
	workspaces: CloudWorkspace[];
	hasGitHubInstallation: boolean;
	githubRepositories: GitHubRepository[];
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	return "now";
}

function isInactive(date: Date): boolean {
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const days = diff / (1000 * 60 * 60 * 24);
	return days > 7;
}

export function CloudHomePage({
	organizationId,
	workspaces,
	hasGitHubInstallation,
	githubRepositories,
}: CloudHomePageProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const [searchQuery, setSearchQuery] = useState("");
	const [promptInput, setPromptInput] = useState("");
	const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(
		null,
	);

	// Get recent repos (from recent workspaces)
	const recentRepos = useMemo(() => {
		const repoMap = new Map<string, GitHubRepository>();
		for (const ws of workspaces.slice(0, 5)) {
			const repo = githubRepositories.find(
				(r) => r.owner === ws.repoOwner && r.name === ws.repoName,
			);
			if (repo && !repoMap.has(repo.id)) {
				repoMap.set(repo.id, repo);
			}
		}
		return Array.from(repoMap.values()).slice(0, 3);
	}, [workspaces, githubRepositories]);

	// Create session mutation
	const createMutation = useMutation(
		trpc.cloudWorkspace.create.mutationOptions({
			onSuccess: (workspace) => {
				if (workspace) {
					// Optimistic navigation with initial prompt as URL param
					const prompt = promptInput.trim();
					const url = prompt
						? `/cloud/${workspace.sessionId}?prompt=${encodeURIComponent(prompt)}`
						: `/cloud/${workspace.sessionId}`;
					router.push(url);
				}
			},
		}),
	);

	const handleQuickCreate = () => {
		if (!selectedRepo) return;

		createMutation.mutate({
			repositoryId: selectedRepo.id,
			repoOwner: selectedRepo.owner,
			repoName: selectedRepo.name,
			title: promptInput.trim() || `${selectedRepo.owner}/${selectedRepo.name}`,
			model: "claude-sonnet-4",
			baseBranch: selectedRepo.defaultBranch,
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey && selectedRepo && promptInput.trim()) {
			e.preventDefault();
			handleQuickCreate();
		}
	};

	const filteredWorkspaces = useMemo(() => {
		if (!searchQuery.trim()) return workspaces;
		const query = searchQuery.toLowerCase();
		return workspaces.filter(
			(w) =>
				w.title?.toLowerCase().includes(query) ||
				`${w.repoOwner}/${w.repoName}`.toLowerCase().includes(query),
		);
	}, [workspaces, searchQuery]);

	const activeWorkspaces = useMemo(
		() => filteredWorkspaces.filter((w) => !isInactive(w.updatedAt)),
		[filteredWorkspaces],
	);

	const inactiveWorkspaces = useMemo(
		() => filteredWorkspaces.filter((w) => isInactive(w.updatedAt)),
		[filteredWorkspaces],
	);

	return (
		<div className="flex h-screen bg-background">
			{/* Sidebar */}
			<aside className="w-64 border-r flex flex-col bg-background">
				{/* Header */}
				<div className="h-14 px-4 flex items-center justify-between border-b">
					<div className="flex items-center gap-2">
						<SupersetLogo className="h-4" />
					</div>
					<div className="flex items-center gap-2">
						<Button variant="ghost" size="icon" className="size-8" asChild>
							<Link href="/cloud/new">
								<LuPlus className="size-4" />
							</Link>
						</Button>
						<div className="size-8 rounded-full bg-muted" />
					</div>
				</div>

				{/* Search */}
				<div className="px-3 py-2">
					<Input
						placeholder="Search sessions..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8 text-sm bg-muted/50 border-0"
					/>
				</div>

				{/* Session list */}
				<ScrollArea className="flex-1">
					{filteredWorkspaces.length === 0 ? (
						<div className="px-4 py-8 text-center text-muted-foreground text-sm">
							{searchQuery ? "No sessions found" : "No sessions yet"}
						</div>
					) : (
						<div className="px-2 py-1">
							{/* Active sessions */}
							{activeWorkspaces.map((workspace) => (
								<SessionListItem key={workspace.id} workspace={workspace} />
							))}

							{/* Inactive sessions */}
							{inactiveWorkspaces.length > 0 && (
								<>
									<div className="px-2 py-2 mt-2 text-xs text-muted-foreground">
										Inactive
									</div>
									{inactiveWorkspaces.map((workspace) => (
										<SessionListItem key={workspace.id} workspace={workspace} />
									))}
								</>
							)}
						</div>
					)}
				</ScrollArea>
			</aside>

			{/* Main content */}
			<main className="flex-1 flex flex-col relative bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:16px_16px]">
				<div className="flex-1 flex flex-col items-center justify-center p-8">
					{/* Centered prompt input */}
					<div className="w-full max-w-2xl space-y-4">
						{/* Repo selector row */}
						{hasGitHubInstallation && githubRepositories.length > 0 && (
							<div className="flex items-center gap-2 flex-wrap">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											className="gap-2 h-8"
										>
											<LuGithub className="size-4" />
											{selectedRepo ? (
												<span className="flex items-center gap-1">
													{selectedRepo.isPrivate && (
														<LuLock className="size-3" />
													)}
													{selectedRepo.fullName}
												</span>
											) : (
												"Select repository"
											)}
											<LuChevronDown className="size-3" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="w-64">
										{recentRepos.length > 0 && (
											<>
												<div className="px-2 py-1.5 text-xs text-muted-foreground">
													Recent
												</div>
												{recentRepos.map((repo) => (
													<DropdownMenuItem
														key={repo.id}
														onClick={() => setSelectedRepo(repo)}
														className="flex items-center gap-2"
													>
														{repo.isPrivate && <LuLock className="size-3" />}
														<span className="truncate">{repo.fullName}</span>
													</DropdownMenuItem>
												))}
												<DropdownMenuSeparator />
											</>
										)}
										<div className="px-2 py-1.5 text-xs text-muted-foreground">
											All repositories
										</div>
										{githubRepositories.map((repo) => (
											<DropdownMenuItem
												key={repo.id}
												onClick={() => setSelectedRepo(repo)}
												className="flex items-center gap-2"
											>
												{repo.isPrivate && <LuLock className="size-3" />}
												<span className="truncate">{repo.fullName}</span>
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>

								{/* Quick select chips for recent repos */}
								{!selectedRepo &&
									recentRepos.slice(0, 2).map((repo) => (
										<Button
											key={repo.id}
											variant="ghost"
											size="sm"
											className="h-7 text-xs text-muted-foreground"
											onClick={() => setSelectedRepo(repo)}
										>
											{repo.name}
										</Button>
									))}
							</div>
						)}

						<div className="relative">
							<Input
								placeholder={
									selectedRepo
										? `What do you want to build with ${selectedRepo.name}?`
										: "Select a repository to get started"
								}
								value={promptInput}
								onChange={(e) => setPromptInput(e.target.value)}
								onKeyDown={handleKeyDown}
								disabled={!selectedRepo || createMutation.isPending}
								className="h-12 px-4 pr-24 text-base rounded-xl border-border/50 shadow-sm"
							/>
							<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
								<Button variant="ghost" size="icon" className="size-8">
									<LuPaperclip className="size-4 text-muted-foreground" />
								</Button>
								<Button
									size="icon"
									className="size-8 rounded-lg"
									disabled={
										!selectedRepo || !promptInput.trim() || createMutation.isPending
									}
									onClick={handleQuickCreate}
								>
									{createMutation.isPending ? (
										<LuLoader className="size-4 animate-spin" />
									) : (
										<LuSend className="size-4" />
									)}
								</Button>
							</div>
						</div>

						{/* Model selector row */}
						<div className="flex items-center justify-between">
							<button
								type="button"
								className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<SupersetLogo className="h-3" />
								<span>Cloud</span>
								<LuChevronDown className="size-3" />
							</button>
							<div className="text-xs text-muted-foreground">
								claude sonnet 4
							</div>
						</div>

						{/* Show connect GitHub prompt if no installation */}
						{!hasGitHubInstallation && (
							<div className="text-center pt-4">
								<p className="text-sm text-muted-foreground mb-2">
									Connect GitHub to create cloud sessions with your repositories
								</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/github/install?organizationId=${organizationId}`;
									}}
								>
									<LuGithub className="size-4 mr-2" />
									Connect GitHub
								</Button>
							</div>
						)}
					</div>

					{/* Stats cards */}
					<div className="w-full max-w-2xl mt-12 grid grid-cols-3 gap-4">
						<StatsCard label="Sessions" value={workspaces.length.toString()} />
						<StatsCard
							label="Active"
							value={activeWorkspaces.length.toString()}
						/>
						<StatsCard
							label="This week"
							value={workspaces
								.filter((w) => {
									const diff = Date.now() - new Date(w.createdAt).getTime();
									return diff < 7 * 24 * 60 * 60 * 1000;
								})
								.length.toString()}
						/>
					</div>
				</div>

				{/* Footer */}
				<div className="absolute bottom-4 left-1/2 -translate-x-1/2">
					<span className="text-xs text-muted-foreground flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-green-500" />
						{workspaces.length} cloud sessions
					</span>
				</div>
			</main>
		</div>
	);
}

function SessionListItem({ workspace }: { workspace: CloudWorkspace }) {
	return (
		<Link
			href={`/cloud/${workspace.sessionId}`}
			className="block px-2 py-2 rounded-md hover:bg-muted transition-colors"
		>
			<p className="text-sm truncate">
				{workspace.title || `${workspace.repoOwner}/${workspace.repoName}`}
			</p>
			<p className="text-xs text-muted-foreground mt-0.5 truncate">
				{formatRelativeTime(workspace.updatedAt)} · {workspace.repoOwner}/
				{workspace.repoName}
			</p>
		</Link>
	);
}

const SPARKLINE_HEIGHTS = [45, 65, 35, 80, 50, 70, 40, 85, 55, 75, 30, 60];

function StatsCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-background/80 backdrop-blur border rounded-xl p-4">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="text-2xl font-semibold mt-1">{value}</p>
			{/* Mini sparkline */}
			<div className="mt-3 h-8 flex items-end gap-0.5">
				{SPARKLINE_HEIGHTS.map((height, i) => (
					<div
						key={i}
						className="flex-1 bg-primary/20 rounded-sm"
						style={{ height: `${height}%` }}
					/>
				))}
			</div>
		</div>
	);
}
