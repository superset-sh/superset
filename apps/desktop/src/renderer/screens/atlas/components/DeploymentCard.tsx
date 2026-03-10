import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
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

	return (
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

			{project.vercelUrl ? (
				<a
					href={project.vercelUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 text-xs text-primary hover:underline"
				>
					<LuExternalLink className="size-3" />
					{project.vercelUrl}
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
						onClick={() => onDelete(project.id)}
					>
						<LuTrash2 className="size-3.5" />
					</Button>
				) : null}
			</div>
		</div>
	);
}
