"use client";

import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

export default function NewCloudWorkspacePage() {
	const [selectedRepoId, setSelectedRepoId] = useState("");
	const [name, setName] = useState("");
	const [branch, setBranch] = useState("");

	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const { data: organization, isLoading: isLoadingOrg } = useQuery(
		trpc.user.myOrganization.queryOptions(),
	);

	const { data: repositories, isLoading: isLoadingRepos } = useQuery({
		...trpc.integration.github.listRepositories.queryOptions({
			organizationId: organization?.id ?? "",
		}),
		enabled: !!organization?.id,
	});

	const selectedRepo = repositories?.find((r) => r.id === selectedRepoId);

	const createMutation = useMutation(
		trpc.cloudWorkspace.create.mutationOptions({
			onSuccess: () => {
				toast.success("Workspace created", {
					description: "Your cloud workspace has been created successfully.",
				});
				queryClient.invalidateQueries({
					queryKey: trpc.cloudWorkspace.all.queryKey(),
				});
				router.push("/cloud");
			},
			onError: (error) => {
				toast.error("Failed to create workspace", {
					description: error.message,
				});
			},
		}),
	);

	const handleRepoChange = (repoId: string) => {
		setSelectedRepoId(repoId);
		const repo = repositories?.find((r) => r.id === repoId);
		if (repo) {
			setBranch(repo.defaultBranch);
		}
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!organization) {
			toast.error("No organization found");
			return;
		}

		if (!selectedRepo) {
			toast.error("Please select a repository");
			return;
		}

		createMutation.mutate({
			organizationId: organization.id,
			repoOwner: selectedRepo.owner,
			repoName: selectedRepo.name,
			repoUrl: `https://github.com/${selectedRepo.fullName}`,
			name: name || `${selectedRepo.name}-workspace`,
			branch: branch || selectedRepo.defaultBranch,
		});
	};

	if (isLoadingOrg) {
		return (
			<div className="py-8 text-center text-muted-foreground">Loading...</div>
		);
	}

	if (!organization) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					You need to be part of an organization to create workspaces.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<Link
				href="/cloud"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to Cloud Workspaces
			</Link>

			<section>
				<h2 className="text-xl font-semibold">Create Cloud Workspace</h2>
				<p className="text-muted-foreground">
					Create a new cloud workspace from a GitHub repository.
				</p>
			</section>

			<form onSubmit={handleSubmit} className="max-w-md space-y-6">
				<div className="space-y-2">
					<Label htmlFor="repository">Repository</Label>
					{isLoadingRepos ? (
						<Skeleton className="h-9 w-full" />
					) : repositories && repositories.length > 0 ? (
						<div className="flex w-full gap-2">
							<Select value={selectedRepoId} onValueChange={handleRepoChange}>
								<SelectTrigger className="flex-1">
									<SelectValue placeholder="Select a repository" />
								</SelectTrigger>
								<SelectContent>
									{repositories.map((repo) => (
										<SelectItem key={repo.id} value={repo.id}>
											{repo.fullName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button variant="outline" asChild>
								<Link href="/integrations/github">
									<Settings className="mr-2 size-4" />
									Manage
								</Link>
							</Button>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No repositories found. Please connect your GitHub account in{" "}
							<Link href="/integrations/github" className="underline">
								Integrations
							</Link>
							.
						</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="name">Workspace Name</Label>
					<Input
						id="name"
						placeholder="my-workspace"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Leave empty to auto-generate from repository name.
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="branch">Branch</Label>
					<Input
						id="branch"
						placeholder={selectedRepo?.defaultBranch || "main"}
						value={branch}
						onChange={(e) => setBranch(e.target.value)}
					/>
				</div>

				<div className="flex gap-3">
					<Button
						type="button"
						variant="outline"
						onClick={() => router.push("/cloud")}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						disabled={createMutation.isPending || !selectedRepoId}
					>
						{createMutation.isPending ? "Creating..." : "Create Workspace"}
					</Button>
				</div>
			</form>
		</div>
	);
}
