import type { SelectRepository } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
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
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef, useState } from "react";
import { LuCloud, LuExternalLink, LuGithub } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCloudWorkspaceMutations } from "renderer/react-query/cloud-workspaces";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { create } from "zustand";

interface NewCloudWorkspaceModalStore {
	isOpen: boolean;
	open: () => void;
	close: () => void;
}

export const useNewCloudWorkspaceModal = create<NewCloudWorkspaceModalStore>(
	(set) => ({
		isOpen: false,
		open: () => set({ isOpen: true }),
		close: () => set({ isOpen: false }),
	}),
);

export function NewCloudWorkspaceModal() {
	const { isOpen, close } = useNewCloudWorkspaceModal();
	const [name, setName] = useState("");
	const [repositoryId, setRepositoryId] = useState<string | null>(null);
	const [branch, setBranch] = useState("");
	const nameInputRef = useRef<HTMLInputElement>(null);

	const collections = useCollections();
	const { data: repositories } = useLiveQuery(
		(q) => q.from({ repositories: collections.repositories }),
		[collections],
	);

	const { createWorkspace, isReady } = useCloudWorkspaceMutations();
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();

	const hasRepositories = repositories && repositories.length > 0;

	const handleOpenGitHubIntegration = () => {
		openUrlMutation.mutate(`${env.NEXT_PUBLIC_WEB_URL}/integrations/github`);
	};

	// Focus name input when modal opens
	useEffect(() => {
		if (isOpen) {
			const timer = setTimeout(() => {
				nameInputRef.current?.focus();
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen]);

	const resetForm = () => {
		setName("");
		setRepositoryId(null);
		setBranch("");
	};

	const handleClose = () => {
		close();
		resetForm();
	};

	const handleCreate = async () => {
		if (!repositoryId) return;

		createWorkspace.mutate(
			{
				name: name || "Cloud Workspace",
				repositoryId,
				branch: branch || undefined,
			},
			{
				onSuccess: () => {
					handleClose();
				},
			},
		);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (
			e.key === "Enter" &&
			!e.shiftKey &&
			repositoryId &&
			!createWorkspace.isPending
		) {
			e.preventDefault();
			handleCreate();
		}
	};

	const canCreate = isReady && repositoryId && !createWorkspace.isPending;

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent
				className="sm:max-w-[400px] gap-0 p-0 overflow-hidden"
				onKeyDown={handleKeyDown}
			>
				<DialogHeader className="px-4 pt-4 pb-3">
					<DialogTitle className="text-base flex items-center gap-2">
						<LuCloud className="size-4" />
						New Cloud Workspace
					</DialogTitle>
				</DialogHeader>

				<div className="px-4 pb-4 space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input
							ref={nameInputRef}
							id="name"
							placeholder="My Cloud Workspace"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="repository">Repository</Label>
						<Select value={repositoryId ?? ""} onValueChange={setRepositoryId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a repository" />
							</SelectTrigger>
							<SelectContent>
								{repositories?.map((repo: SelectRepository) => (
									<SelectItem key={repo.id} value={repo.id}>
										{repo.repoOwner && repo.repoName
											? `${repo.repoOwner}/${repo.repoName}`
											: (repo.name ?? repo.id)}
									</SelectItem>
								))}
								{!hasRepositories && (
									<div className="px-2 py-1.5 text-sm text-muted-foreground">
										No repositories available
									</div>
								)}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="branch">Branch (optional)</Label>
						<Input
							id="branch"
							placeholder="main"
							value={branch}
							onChange={(e) => setBranch(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Leave empty to use the default branch
						</p>
					</div>

					<div className="flex items-center justify-between pt-2">
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground hover:text-foreground gap-1.5"
							onClick={handleOpenGitHubIntegration}
						>
							<LuGithub className="size-4" />
							Connect GitHub
							<LuExternalLink className="size-3" />
						</Button>
						<div className="flex gap-2">
							<Button variant="outline" onClick={handleClose}>
								Cancel
							</Button>
							<Button onClick={handleCreate} disabled={!canCreate}>
								{createWorkspace.isPending ? "Creating..." : "Create"}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
