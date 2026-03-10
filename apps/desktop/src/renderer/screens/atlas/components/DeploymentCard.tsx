import { useState } from "react";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import {
	LuFolder,
	LuGitBranch,
	LuExternalLink,
	LuTrash2,
} from "react-icons/lu";
import type { SelectAtlasProject } from "@superset/local-db";

interface DeploymentCardProps {
	project: SelectAtlasProject;
	onDelete?: (id: string) => void;
	onOpenFolder?: (path: string) => void;
}

const STATUS_BADGE: Record<
	string,
	{ label: string; variant: "default" | "secondary" | "destructive" }
> = {
	created: { label: "생성됨", variant: "secondary" },
	deployed: { label: "배포됨", variant: "default" },
	error: { label: "오류", variant: "destructive" },
};

export function DeploymentCard({
	project,
	onDelete,
	onOpenFolder,
}: DeploymentCardProps) {
	const statusInfo = STATUS_BADGE[project.status] ?? STATUS_BADGE.created;
	const features = project.features as string[];
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [confirmText, setConfirmText] = useState("");

	const hasSupabase = !!project.supabaseProjectId;
	const hasVercel = !!project.vercelProjectId;
	const canDelete = confirmText === project.name;

	const handleDeleteConfirm = () => {
		if (!canDelete) return;
		setDeleteDialogOpen(false);
		setConfirmText("");
		onDelete?.(project.id);
	};

	return (
		<>
			<div className="rounded-lg border border-border p-4 space-y-3">
				<div className="flex items-start justify-between">
					<div>
						<h3 className="text-sm font-semibold">{project.name}</h3>
						<p className="text-xs text-muted-foreground mt-0.5">
							{new Date(project.createdAt).toLocaleDateString("ko-KR")}
						</p>
					</div>
					<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
				</div>

				<div className="flex items-center gap-4 text-xs text-muted-foreground">
					<span className="flex items-center gap-1">
						<LuFolder className="size-3" />
						{features.length} Features
					</span>
					{project.gitInitialized ? (
						<span className="flex items-center gap-1">
							<LuGitBranch className="size-3" />
							Git
						</span>
					) : null}
				</div>

				<code className="block p-2 rounded bg-muted text-xs font-mono truncate">
					{project.localPath}
				</code>

				{project.gitRemoteUrl ? (
				<a
					href={project.gitRemoteUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 text-xs text-primary hover:underline"
				>
					<LuGitBranch className="size-3" />
					GitHub: {project.gitRemoteUrl}
				</a>
			) : null}

			{project.supabaseProjectUrl ? (
					<a
						href={project.supabaseProjectUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1 text-xs text-primary hover:underline"
					>
						<LuExternalLink className="size-3" />
						Supabase: {project.supabaseProjectUrl}
					</a>
				) : null}

				{project.vercelUrl ? (
					<a
						href={project.vercelUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1 text-xs text-primary hover:underline"
					>
						<LuExternalLink className="size-3" />
						Vercel: {project.vercelUrl}
					</a>
				) : null}

				<div className="flex justify-end gap-1 pt-1">
					{onOpenFolder ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onOpenFolder(project.localPath)}
						>
							<LuFolder className="size-3.5 mr-1" />
							폴더 열기
						</Button>
					) : null}
					{onDelete ? (
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive"
							onClick={() => setDeleteDialogOpen(true)}
						>
							<LuTrash2 className="size-3.5" />
						</Button>
					) : null}
				</div>
			</div>

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent className="max-w-[400px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-3">
						<AlertDialogTitle className="font-medium">
							프로젝트 삭제
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-2">
								<span className="block">
									<strong className="text-foreground">{project.name}</strong>{" "}
									프로젝트를 삭제합니다.
								</span>
								{(hasSupabase || hasVercel) ? (
									<span className="block text-destructive">
										{[
											hasSupabase ? "Supabase" : null,
											hasVercel ? "Vercel" : null,
										]
											.filter(Boolean)
											.join(", ")}{" "}
										프로젝트도 함께 삭제됩니다.
									</span>
								) : null}
								<span className="block">
									이 작업은 되돌릴 수 없습니다. 계속하려면 아래에{" "}
									<strong className="text-foreground">{project.name}</strong>을
									입력하세요.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="px-4 pb-3">
						<Input
							value={confirmText}
							onChange={(e) => setConfirmText(e.target.value)}
							placeholder={project.name}
							className="text-sm"
							autoFocus
						/>
					</div>

					<AlertDialogFooter className="px-4 pb-4 pt-1 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => {
								setDeleteDialogOpen(false);
								setConfirmText("");
							}}
						>
							취소
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							disabled={!canDelete}
							onClick={handleDeleteConfirm}
						>
							삭제
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
