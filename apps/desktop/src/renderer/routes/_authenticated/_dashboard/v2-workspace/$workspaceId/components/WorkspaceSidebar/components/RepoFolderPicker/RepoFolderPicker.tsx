import { useLingui } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useWorkspaceRepos } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceRepos";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useRepoDirtyCounts } from "../../../../hooks/useRepoDirtyCounts";

/** `repository` is `owner/name` when the checkout has a parsed GitHub remote. */
function repoIconUrl(repository: string | null): string | null {
	return resolveProjectIconUrl({
		icon: null,
		repoOwner: repository?.split("/")[0] ?? null,
	});
}

interface RepoFolderPickerProps {
	workspaceId: string;
}

export function RepoFolderPicker({ workspaceId }: RepoFolderPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { repos, selected, hasMultipleRepos, selectFolder } =
		useWorkspaceRepos(workspaceId);
	const dirtyCounts = useRepoDirtyCounts({
		workspaceId,
		repos,
		enabled: open && hasMultipleRepos,
	});

	if (!hasMultipleRepos || !selected) return null;

	return (
		<div className="flex h-9 shrink-0 items-center border-b bg-background px-2">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Change folder" })}
						className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-xs text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						<ProjectThumbnail
							projectName={selected.folder}
							iconUrl={repoIconUrl(selected.repository)}
							className="size-4"
						/>
						<span className="min-w-0 truncate font-medium">
							{selected.folder}
						</span>
						<ChevronDown className="ml-auto size-3 shrink-0 text-muted-foreground" />
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="flex max-h-96 w-72 flex-col overflow-hidden p-0"
					align="start"
				>
					<ScrollArea className="flex-1 overflow-y-auto">
						<div className="p-1">
							{repos.map((repo) => {
								const isSelected = repo.folder === selected.folder;
								const dirtyCount = dirtyCounts[repo.folder];
								return (
									<button
										key={repo.folder}
										type="button"
										aria-current={isSelected}
										className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
										onClick={() => {
											selectFolder(repo.folder);
											setOpen(false);
										}}
									>
										<ProjectThumbnail
											projectName={repo.folder}
											iconUrl={repoIconUrl(repo.repository)}
											className="size-4"
										/>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate">{repo.folder}</span>
											{repo.repository && repo.repository !== repo.folder && (
												<span className="truncate text-muted-foreground text-xs">
													{repo.repository}
												</span>
											)}
										</span>
										{dirtyCount != null && dirtyCount > 0 && (
											<span
												title={t({ message: "Changed files" })}
												className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium leading-4 tabular-nums text-muted-foreground"
											>
												{dirtyCount > 99 ? "99+" : dirtyCount}
											</span>
										)}
										<Check
											className={cn(
												"size-3.5 shrink-0",
												!isSelected && "invisible",
											)}
										/>
									</button>
								);
							})}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
}
