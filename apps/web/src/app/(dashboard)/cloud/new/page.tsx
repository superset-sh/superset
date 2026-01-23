"use client";

import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

export default function NewCloudWorkspacePage() {
	const [repoUrl, setRepoUrl] = useState("");
	const [name, setName] = useState("");
	const [branch, setBranch] = useState("main");

	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const { data: organization, isLoading: isLoadingOrg } = useQuery(
		trpc.user.myOrganization.queryOptions(),
	);

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

	const parseGitHubUrl = (
		url: string,
	): { owner: string; name: string } | null => {
		const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
		if (match?.[1] && match[2]) {
			return { owner: match[1], name: match[2].replace(/\.git$/, "") };
		}
		return null;
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!organization) {
			toast.error("No organization found");
			return;
		}

		const parsed = parseGitHubUrl(repoUrl);
		if (!parsed) {
			toast.error("Invalid repository URL", {
				description: "Please enter a valid GitHub repository URL.",
			});
			return;
		}

		createMutation.mutate({
			organizationId: organization.id,
			repoOwner: parsed.owner,
			repoName: parsed.name,
			repoUrl,
			name: name || `${parsed.name}-workspace`,
			branch,
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
					<Label htmlFor="repoUrl">Repository URL</Label>
					<Input
						id="repoUrl"
						placeholder="https://github.com/owner/repo"
						value={repoUrl}
						onChange={(e) => setRepoUrl(e.target.value)}
						required
					/>
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
						placeholder="main"
						value={branch}
						onChange={(e) => setBranch(e.target.value)}
						required
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
					<Button type="submit" disabled={createMutation.isPending}>
						{createMutation.isPending ? "Creating..." : "Create Workspace"}
					</Button>
				</div>
			</form>
		</div>
	);
}
