import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { getAppOption } from "renderer/components/OpenInButton/OpenInButton";
import { trpc } from "renderer/lib/trpc";
import type { ChangedFile, FileStatus } from "shared/changes-types";

interface FileHeaderProps {
	file: ChangedFile;
	worktreePath: string;
}

function getStatusColor(status: FileStatus): string {
	switch (status) {
		case "added":
			return "text-green-500";
		case "modified":
			return "text-yellow-500";
		case "deleted":
			return "text-red-500";
		case "renamed":
		case "copied":
			return "text-blue-500";
		case "untracked":
			return "text-muted-foreground";
		default:
			return "text-muted-foreground";
	}
}

function getStatusLabel(status: string): string {
	switch (status) {
		case "added":
			return "Added";
		case "modified":
			return "Modified";
		case "deleted":
			return "Deleted";
		case "renamed":
			return "Renamed";
		case "copied":
			return "Copied";
		case "untracked":
			return "Untracked";
		default:
			return status;
	}
}

export function FileHeader({ file, worktreePath }: FileHeaderProps) {
	const statusColor = getStatusColor(file.status);
	const statusLabel = getStatusLabel(file.status);
	const hasStats = file.additions > 0 || file.deletions > 0;

	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation();

	const fullPath = `${worktreePath}/${file.path}`;
	const currentApp = getAppOption(lastUsedApp);

	const handleOpenFile = () => {
		openInApp.mutate({ path: fullPath, app: lastUsedApp });
	};

	return (
		<div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
			<div className="flex-1 min-w-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenFile}
							className="text-sm font-medium truncate font-mono text-left hover:underline hover:text-primary cursor-pointer"
						>
							{file.path}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Open in {currentApp.label}
					</TooltipContent>
				</Tooltip>
				{file.oldPath && (
					<div className="text-xs text-muted-foreground truncate">
						{file.status === "copied" ? "Copied from" : "Renamed from"}{" "}
						{file.oldPath}
					</div>
				)}
			</div>

			<span
				className={cn(
					"text-xs font-medium px-2 py-0.5 rounded-full border",
					statusColor,
					"border-current/30 bg-current/10",
				)}
			>
				{statusLabel}
			</span>

			{hasStats && (
				<div className="flex items-center gap-2 text-sm font-mono">
					{file.additions > 0 && (
						<span className="text-green-500">+{file.additions}</span>
					)}
					{file.deletions > 0 && (
						<span className="text-red-500">-{file.deletions}</span>
					)}
				</div>
			)}
		</div>
	);
}
