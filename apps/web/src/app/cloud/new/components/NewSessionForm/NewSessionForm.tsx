"use client";

import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	LuArrowLeft,
	LuCloud,
	LuGithub,
	LuLoader,
	LuLock,
} from "react-icons/lu";

import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface GitHubInstallation {
	id: string;
	accountLogin: string;
	accountType: string;
	suspended: boolean;
	lastSyncedAt: Date | null;
	createdAt: Date;
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

interface NewSessionFormProps {
	organizationId: string;
	githubInstallation: GitHubInstallation | null;
	githubRepositories: GitHubRepository[];
}

const MODELS = [
	{
		id: "claude-sonnet-4",
		name: "Claude Sonnet 4",
		description: "Balanced performance and speed",
	},
	{
		id: "claude-opus-4",
		name: "Claude Opus 4",
		description: "Most capable, best for complex tasks",
	},
	{
		id: "claude-haiku-3-5",
		name: "Claude Haiku 3.5",
		description: "Fast and affordable",
	},
];

export function NewSessionForm({
	organizationId,
	githubInstallation,
	githubRepositories,
}: NewSessionFormProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);

	const [selectedRepoId, setSelectedRepoId] = useState<string>("");
	const [title, setTitle] = useState("");
	const [model, setModel] = useState("claude-sonnet-4");
	const [baseBranch, setBaseBranch] = useState("main");

	const createMutation = useMutation(
		trpc.cloudWorkspace.create.mutationOptions({
			onSuccess: (workspace) => {
				if (workspace) {
					router.push(`/cloud/${workspace.sessionId}`);
				}
			},
			onError: (err) => {
				setError(err.message || "Failed to create session");
			},
		}),
	);

	const isCreating = createMutation.isPending;
	const hasGitHubInstallation = !!githubInstallation;
	const isGitHubSuspended = githubInstallation?.suspended ?? false;

	const selectedRepo = githubRepositories.find((r) => r.id === selectedRepoId);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!selectedRepo) {
			setError("Please select a repository");
			return;
		}

		const sessionTitle =
			title.trim() || `${selectedRepo.owner}/${selectedRepo.name}`;

		createMutation.mutate({
			repositoryId: selectedRepo.id,
			repoOwner: selectedRepo.owner,
			repoName: selectedRepo.name,
			title: sessionTitle,
			model: model as "claude-sonnet-4" | "claude-opus-4" | "claude-haiku-3-5",
			baseBranch: baseBranch || selectedRepo.defaultBranch,
		});
	};

	// Show GitHub connection prompt if not connected
	if (!hasGitHubInstallation || isGitHubSuspended) {
		return (
			<div className="min-h-screen bg-background p-8">
				<div className="max-w-xl mx-auto">
					<Button variant="ghost" size="sm" asChild className="mb-6">
						<Link href="/cloud">
							<LuArrowLeft className="size-4 mr-2" />
							Back to Sessions
						</Link>
					</Button>

					<Card>
						<CardHeader>
							<div className="flex items-center gap-2">
								<LuGithub className="size-5" />
								<CardTitle>Connect GitHub</CardTitle>
							</div>
							<CardDescription>
								Connect your GitHub account to create cloud sessions with access
								to your repositories.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{isGitHubSuspended && (
								<div className="p-3 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-sm">
									Your GitHub installation is suspended. Please reauthorize to
									continue.
								</div>
							)}
							<p className="text-sm text-muted-foreground">
								Cloud sessions need access to your GitHub repositories to clone
								code and create branches.
							</p>
							<div className="flex gap-3">
								<Button asChild>
									<a href={`${env.NEXT_PUBLIC_API_URL}/api/github/install?organizationId=${organizationId}`}>
										<LuGithub className="size-4 mr-2" />
										Connect GitHub
									</a>
								</Button>
								<Button variant="outline" asChild>
									<Link href="/cloud">Cancel</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background p-8">
			<div className="max-w-xl mx-auto">
				<Button variant="ghost" size="sm" asChild className="mb-6">
					<Link href="/cloud">
						<LuArrowLeft className="size-4 mr-2" />
						Back to Sessions
					</Link>
				</Button>

				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<LuCloud className="size-5" />
							<CardTitle>New Cloud Session</CardTitle>
						</div>
						<CardDescription>
							Create a new cloud session to run Claude in a sandboxed
							environment with full access to your repository.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className="space-y-6">
							{error && (
								<div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
									{error}
								</div>
							)}

							{/* Repository selection */}
							<div className="space-y-2">
								<Label htmlFor="repository">Repository *</Label>
								<Select
									value={selectedRepoId}
									onValueChange={(value) => {
										setSelectedRepoId(value);
										// Update base branch to repo's default when selecting
										const repo = githubRepositories.find((r) => r.id === value);
										if (repo) {
											setBaseBranch(repo.defaultBranch);
										}
									}}
								>
									<SelectTrigger id="repository">
										<SelectValue placeholder="Select a repository" />
									</SelectTrigger>
									<SelectContent>
										{githubRepositories.length === 0 ? (
											<div className="p-3 text-sm text-muted-foreground space-y-2">
												<p>No repositories found.</p>
												<a
													href="https://github.com/apps/superset-app/installations/new"
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary hover:underline inline-flex items-center gap-1"
												>
													Configure repository access
													<LuGithub className="size-3" />
												</a>
											</div>
										) : (
											githubRepositories.map((repo) => (
												<SelectItem key={repo.id} value={repo.id}>
													<div className="flex items-center gap-2">
														{repo.isPrivate && (
															<LuLock className="size-3 text-muted-foreground" />
														)}
														<span>{repo.fullName}</span>
													</div>
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									The repository Claude will have access to.
								</p>
							</div>

							{/* Title */}
							<div className="space-y-2">
								<Label htmlFor="title">Title (optional)</Label>
								<Input
									id="title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="e.g., Add user authentication"
								/>
								<p className="text-xs text-muted-foreground">
									A title helps identify the session. If not provided, the
									repository name will be used.
								</p>
							</div>

							{/* Model selection */}
							<div className="space-y-2">
								<Label htmlFor="model">Model</Label>
								<Select value={model} onValueChange={setModel}>
									<SelectTrigger id="model">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{MODELS.map((m) => (
											<SelectItem key={m.id} value={m.id}>
												<div>
													<span className="font-medium">{m.name}</span>
													<span className="text-muted-foreground ml-2 text-xs">
														- {m.description}
													</span>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Base branch */}
							<div className="space-y-2">
								<Label htmlFor="baseBranch">Base Branch</Label>
								<Input
									id="baseBranch"
									value={baseBranch}
									onChange={(e) => setBaseBranch(e.target.value)}
									placeholder={selectedRepo?.defaultBranch || "main"}
								/>
								<p className="text-xs text-muted-foreground">
									The branch to base the work on. A new branch will be created
									from this.
								</p>
							</div>

							{/* Submit */}
							<div className="flex justify-end gap-3">
								<Button variant="outline" type="button" asChild>
									<Link href="/cloud">Cancel</Link>
								</Button>
								<Button type="submit" disabled={isCreating || !selectedRepoId}>
									{isCreating ? (
										<>
											<LuLoader className="size-4 mr-2 animate-spin" />
											Creating...
										</>
									) : (
										"Create Session"
									)}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
