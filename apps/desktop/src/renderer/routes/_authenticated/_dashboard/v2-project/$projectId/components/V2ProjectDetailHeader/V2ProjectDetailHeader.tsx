import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import {
	LuArrowLeft,
	LuExternalLink,
	LuFolderGit2,
	LuGithub,
	LuPencil,
	LuPlus,
	LuSettings,
} from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import type { AccessibleV2Project } from "renderer/routes/_authenticated/_dashboard/v2-projects/hooks/useAccessibleV2Projects";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface V2ProjectDetailHeaderProps {
	project: AccessibleV2Project;
}

export function V2ProjectDetailHeader({ project }: V2ProjectDetailHeaderProps) {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(project.name);
	const [isSaving, setIsSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isRenaming) setRenameValue(project.name);
	}, [project.name, isRenaming]);

	useEffect(() => {
		if (isRenaming) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isRenaming]);

	const repoFullName =
		project.githubFullName ??
		(project.githubOwner && project.githubRepoName
			? `${project.githubOwner}/${project.githubRepoName}`
			: null);

	const startRename = useCallback(() => {
		setRenameValue(project.name);
		setIsRenaming(true);
	}, [project.name]);

	const cancelRename = useCallback(() => {
		setIsRenaming(false);
		setRenameValue(project.name);
	}, [project.name]);

	const submitRename = useCallback(async () => {
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === project.name) {
			cancelRename();
			return;
		}
		setIsSaving(true);
		try {
			await apiTrpcClient.v2Project.update.mutate({
				id: project.id,
				name: trimmed,
				slug: trimmed.toLowerCase().replace(/\s+/g, "-"),
			});
			setIsRenaming(false);
		} catch (error) {
			toast.error(
				`Failed to rename: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsSaving(false);
		}
	}, [cancelRename, project.id, project.name, renameValue]);

	const goToSettings = () => {
		navigate({
			to: "/settings/project/$projectId",
			params: { projectId: project.id },
		});
	};

	return (
		<div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3">
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<Button
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-1.5 text-xs"
					onClick={() => navigate({ to: "/v2-projects" })}
				>
					<LuArrowLeft className="size-3.5" />
					All projects
				</Button>
			</div>

			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
						<LuFolderGit2 className="size-4" />
					</div>
					<div className="flex min-w-0 flex-col gap-0.5">
						{isRenaming ? (
							<Input
								ref={inputRef}
								value={renameValue}
								onChange={(event) => setRenameValue(event.target.value)}
								onBlur={() => {
									void submitRename();
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void submitRename();
									} else if (event.key === "Escape") {
										event.preventDefault();
										cancelRename();
									}
								}}
								disabled={isSaving}
								className={cn(
									"h-7 w-64 px-2 text-sm font-semibold",
									isSaving && "opacity-60",
								)}
								aria-label="Project name"
							/>
						) : (
							<button
								type="button"
								onClick={startRename}
								className="group flex items-center gap-1.5 text-left text-sm font-semibold hover:text-foreground"
							>
								<span className="truncate">{project.name}</span>
								<LuPencil className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
							</button>
						)}
						<span className="truncate text-xs text-muted-foreground">
							{project.slug}
						</span>
					</div>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					<Button
						size="sm"
						className="h-8 gap-1.5"
						onClick={() => openNewWorkspaceModal(project.id)}
					>
						<LuPlus className="size-4" />
						New workspace
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="size-8"
								aria-label="Project options"
							>
								<HiEllipsisHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={startRename}>
								<LuPencil className="size-4" />
								Rename
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={goToSettings}>
								<LuSettings className="size-4" />
								Project settings
							</DropdownMenuItem>
							{repoFullName ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem asChild>
										<a
											href={`https://github.com/${repoFullName}`}
											target="_blank"
											rel="noopener noreferrer"
										>
											<LuExternalLink className="size-4" />
											View on GitHub
										</a>
									</DropdownMenuItem>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Meta row */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{repoFullName ? (
					<a
						href={`https://github.com/${repoFullName}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 hover:text-foreground"
					>
						<LuGithub className="size-3.5" />
						<span>{repoFullName}</span>
						<LuExternalLink className="size-3" />
					</a>
				) : (
					<button
						type="button"
						onClick={goToSettings}
						className="inline-flex items-center gap-1.5 text-primary hover:underline"
					>
						<LuGithub className="size-3.5" />
						Connect Git Repository
					</button>
				)}
			</div>
		</div>
	);
}
