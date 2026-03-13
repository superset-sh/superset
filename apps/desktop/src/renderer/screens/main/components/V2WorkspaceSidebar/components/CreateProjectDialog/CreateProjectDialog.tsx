import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface CreateProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({
	open,
	onOpenChange,
}: CreateProjectDialogProps) {
	const [name, setName] = useState("");
	const [githubRepositoryId, setGithubRepositoryId] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const collections = useCollections();
	const { data: repos = [] } = useLiveQuery(
		(q) => q.from({ repos: collections.githubRepositories }),
		[collections],
	);

	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !slug || !githubRepositoryId) return;

		setIsSubmitting(true);
		try {
			await apiTrpcClient.v2Project.create.mutate({
				name: name.trim(),
				slug,
				githubRepositoryId,
			});
			toast.success(`Project "${name.trim()}" created`);
			setName("");
			setGithubRepositoryId("");
			onOpenChange(false);
		} catch (err) {
			toast.error("Failed to create project", {
				description: err instanceof Error ? err.message : "Unknown error",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[400px]">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>New Project</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="project-name">Name</Label>
							<Input
								id="project-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="My Project"
								autoFocus
							/>
						</div>
						{slug && (
							<p className="text-xs text-muted-foreground">
								Slug: <span className="font-mono">{slug}</span>
							</p>
						)}
						<div className="space-y-2">
							<Label htmlFor="project-repo">GitHub Repository</Label>
							<Select
								value={githubRepositoryId}
								onValueChange={setGithubRepositoryId}
							>
								<SelectTrigger id="project-repo">
									<SelectValue placeholder="Select a repository" />
								</SelectTrigger>
								<SelectContent>
									{[...repos]
										.sort((a, b) => a.fullName.localeCompare(b.fullName))
										.map((repo) => (
											<SelectItem key={repo.id} value={repo.id}>
												{repo.fullName}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={!name.trim() || !githubRepositoryId || isSubmitting}
						>
							{isSubmitting ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
