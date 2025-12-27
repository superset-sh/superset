import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuChevronUp, LuFolderGit, LuFolderOpen, LuX } from "react-icons/lu";
import { formatPathWithProject } from "renderer/lib/formatPath";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";
import { ActionCard } from "./ActionCard";
import { CloneRepoDialog } from "./CloneRepoDialog";
import { InitGitDialog } from "./InitGitDialog";
import { StartTopBar } from "./StartTopBar";

export function StartView() {
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const openNew = useOpenNew();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const [error, setError] = useState<string | null>(null);
	const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
	const [initGitDialog, setInitGitDialog] = useState<{
		isOpen: boolean;
		selectedPath: string;
	}>({ isOpen: false, selectedPath: "" });
	const [showAllProjects, setShowAllProjects] = useState(false);
	const [visibleCount, setVisibleCount] = useState(50);

	const handleOpenProject = () => {
		setError(null);
		openNew.mutate(undefined, {
			onSuccess: (result) => {
				if (result.canceled) {
					return;
				}

				if ("error" in result) {
					setError(result.error);
					return;
				}

				if ("needsGitInit" in result) {
					// Show dialog to offer git initialization
					setInitGitDialog({
						isOpen: true,
						selectedPath: result.selectedPath,
					});
					return;
				}

				// Create a main workspace on the current branch
				createBranchWorkspace.mutate({ projectId: result.project.id });
			},
			onError: (err) => {
				setError(err.message || "Failed to open project");
			},
		});
	};

	const handleOpenRecentProject = (projectId: string) => {
		setError(null);
		// Create/activate main workspace on current branch
		createBranchWorkspace.mutate(
			{ projectId },
			{
				onError: (err) => {
					setError(err.message || "Failed to open workspace");
				},
			},
		);
	};

	const hasMoreProjects = recentProjects.length > 5;
	const displayedProjects = showAllProjects
		? recentProjects.slice(0, visibleCount)
		: recentProjects.slice(0, 5);
	const hasMoreToLoad = showAllProjects && recentProjects.length > visibleCount;
	const isLoading = openNew.isPending || createBranchWorkspace.isPending;

	return (
		<div className="flex flex-col h-full w-full bg-background">
			<StartTopBar />
			<div className="flex flex-1 items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-3xl px-8">
					{/* Logo */}
					<div className="min-h-[7rem] flex items-center">
						<svg
							width="282"
							height="46"
							viewBox="0 0 282 46"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							className="w-auto h-12"
							role="img"
							aria-labelledby="superset-logo-title"
						>
							<title id="superset-logo-title">Superset</title>
							<path
								d="M18.1818 4.30346e-05H27.2727V9.09095H18.1818V4.30346e-05ZM9.09091 4.30346e-05H18.1818V9.09095H9.09091V4.30346e-05ZM0 9.09095H9.09091V18.1819H0V9.09095ZM0 18.1819H9.09091V27.2728H0V18.1819ZM9.09091 18.1819H18.1818V27.2728H9.09091V18.1819ZM18.1818 18.1819H27.2727V27.2728H18.1818V18.1819ZM18.1818 27.2728H27.2727V36.3637H18.1818V27.2728ZM18.1818 36.3637H27.2727V45.4546H18.1818V36.3637ZM9.09091 36.3637H18.1818V45.4546H9.09091V36.3637ZM0 36.3637H9.09091V45.4546H0V36.3637ZM0 4.30346e-05H9.09091V9.09095H0V4.30346e-05ZM36.3281 4.30346e-05H45.419V9.09095H36.3281V4.30346e-05ZM36.3281 9.09095H45.419V18.1819H36.3281V9.09095ZM36.3281 18.1819H45.419V27.2728H36.3281V18.1819ZM36.3281 27.2728H45.419V36.3637H36.3281V27.2728ZM36.3281 36.3637H45.419V45.4546H36.3281V36.3637ZM45.419 36.3637H54.5099V45.4546H45.419V36.3637ZM54.5099 36.3637H63.6009V45.4546H54.5099V36.3637ZM54.5099 27.2728H63.6009V36.3637H54.5099V27.2728ZM54.5099 18.1819H63.6009V27.2728H54.5099V18.1819ZM54.5099 9.09095H63.6009V18.1819H54.5099V9.09095ZM54.5099 4.30346e-05H63.6009V9.09095H54.5099V4.30346e-05ZM72.6562 4.30346e-05H81.7472V9.09095H72.6562V4.30346e-05ZM72.6562 9.09095H81.7472V18.1819H72.6562V9.09095ZM72.6562 18.1819H81.7472V27.2728H72.6562V18.1819ZM72.6562 27.2728H81.7472V36.3637H72.6562V27.2728ZM72.6562 36.3637H81.7472V45.4546H72.6562V36.3637ZM81.7472 4.30346e-05H90.8381V9.09095H81.7472V4.30346e-05ZM90.8381 4.30346e-05H99.929V9.09095H90.8381V4.30346e-05ZM90.8381 9.09095H99.929V18.1819H90.8381V9.09095ZM90.8381 18.1819H99.929V27.2728H90.8381V18.1819ZM81.7472 18.1819H90.8381V27.2728H81.7472V18.1819ZM108.984 4.30346e-05H118.075V9.09095H108.984V4.30346e-05ZM108.984 9.09095H118.075V18.1819H108.984V9.09095ZM108.984 18.1819H118.075V27.2728H108.984V18.1819ZM108.984 27.2728H118.075V36.3637H108.984V27.2728ZM108.984 36.3637H118.075V45.4546H108.984V36.3637ZM118.075 4.30346e-05H127.166V9.09095H118.075V4.30346e-05ZM118.075 36.3637H127.166V45.4546H118.075V36.3637ZM118.075 18.1819H127.166V27.2728H118.075V18.1819ZM127.166 4.30346e-05H136.257V9.09095H127.166V4.30346e-05ZM127.166 36.3637H136.257V45.4546H127.166V36.3637ZM145.312 36.3637H154.403V45.4546H145.312V36.3637ZM145.312 27.2728H154.403V36.3637H145.312V27.2728ZM145.312 18.1819H154.403V27.2728H145.312V18.1819ZM145.312 9.09095H154.403V18.1819H145.312V9.09095ZM145.312 4.30346e-05H154.403V9.09095H145.312V4.30346e-05ZM154.403 4.30346e-05H163.494V9.09095H154.403V4.30346e-05ZM163.494 4.30346e-05H172.585V9.09095H163.494V4.30346e-05ZM163.494 9.09095H172.585V18.1819H163.494V9.09095ZM154.403 18.1819H163.494V27.2728H154.403V18.1819ZM163.494 27.2728H172.585V36.3637H163.494V27.2728ZM163.494 36.3637H172.585V45.4546H163.494V36.3637ZM199.822 4.30346e-05H208.913V9.09095H199.822V4.30346e-05ZM190.732 4.30346e-05H199.822V9.09095H190.732V4.30346e-05ZM181.641 9.09095H190.732V18.1819H181.641V9.09095ZM181.641 18.1819H190.732V27.2728H181.641V18.1819ZM190.732 18.1819H199.822V27.2728H190.732V18.1819ZM199.822 18.1819H208.913V27.2728H199.822V18.1819ZM199.822 27.2728H208.913V36.3637H199.822V27.2728ZM199.822 36.3637H208.913V45.4546H199.822V36.3637ZM190.732 36.3637H199.822V45.4546H190.732V36.3637ZM181.641 36.3637H190.732V45.4546H181.641V36.3637ZM181.641 4.30346e-05H190.732V9.09095H181.641V4.30346e-05ZM217.969 4.30346e-05H227.06V9.09095H217.969V4.30346e-05ZM217.969 9.09095H227.06V18.1819H217.969V9.09095ZM217.969 18.1819H227.06V27.2728H217.969V18.1819ZM217.969 27.2728H227.06V36.3637H217.969V27.2728ZM217.969 36.3637H227.06V45.4546H217.969V36.3637ZM227.06 4.30346e-05H236.151V9.09095H227.06V4.30346e-05ZM227.06 36.3637H236.151V45.4546H227.06V36.3637ZM227.06 18.1819H236.151V27.2728H227.06V18.1819ZM236.151 4.30346e-05H245.241V9.09095H236.151V4.30346e-05ZM236.151 36.3637H245.241V45.4546H236.151V36.3637ZM254.297 4.30346e-05H263.388V9.09095H254.297V4.30346e-05ZM263.388 4.30346e-05H272.479V9.09095H263.388V4.30346e-05ZM272.479 4.30346e-05H281.57V9.09095H272.479V4.30346e-05ZM263.388 9.09095H272.479V18.1819H263.388V9.09095ZM263.388 18.1819H272.479V27.2728H263.388V18.1819ZM263.388 27.2728H272.479V36.3637H263.388V27.2728ZM263.388 36.3637H272.479V45.4546H263.388V36.3637Z"
								fill="currentColor"
							/>
						</svg>
					</div>

					{/* Error Display */}
					{error && (
						<div className="w-full max-w-[650px] mb-4 rounded-lg border border-border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
							<div className="flex items-start gap-3 p-3">
								<div className="shrink-0 mt-0.5">
									<HiExclamationTriangle className="h-4 w-4 text-amber-500" />
								</div>
								<p className="flex-1 text-sm text-foreground/90">{error}</p>
								<button
									type="button"
									onClick={() => setError(null)}
									className="shrink-0 p-0.5 rounded hover:bg-accent/50 transition-colors"
									aria-label="Dismiss error"
								>
									<LuX className="h-3.5 w-3.5 text-muted-foreground" />
								</button>
							</div>
						</div>
					)}

					{/* Action Cards and Recent Projects Container */}
					<div className="flex flex-col items-center gap-0 w-full px-2">
						{/* Action Cards */}
						<div className="w-full max-w-[650px] min-w-[280px] inline-flex justify-center items-center gap-4 px-2">
							<ActionCard
								icon={LuFolderOpen}
								label="Open project"
								onClick={handleOpenProject}
								isLoading={isLoading}
							/>

							<ActionCard
								icon={LuFolderGit}
								label="Clone repo"
								onClick={() => {
									setError(null);
									setIsCloneDialogOpen(true);
								}}
								isLoading={isLoading}
							/>
						</div>

						{/* Recent Projects */}
						{displayedProjects.length > 0 && (
							<div className="w-full max-w-[650px]">
								<div className="flex-1 p-1 py-4 rounded-lg flex flex-col gap-1">
									<div className="flex justify-between items-center px-2 py-1">
										<span className="text-muted-foreground text-xs font-normal">
											Recent projects
										</span>
										{hasMoreProjects && (
											<button
												type="button"
												onClick={() => {
													setShowAllProjects(!showAllProjects);
													if (showAllProjects) setVisibleCount(50);
												}}
												className="flex items-center gap-1 text-muted-foreground text-xs font-normal hover:text-foreground transition-colors"
											>
												{showAllProjects ? (
													<>
														Show less
														<LuChevronUp className="h-3 w-3" />
													</>
												) : (
													<>View all ({recentProjects.length})</>
												)}
											</button>
										)}
									</div>

									<div className="max-h-64 overflow-y-auto flex flex-col gap-1">
										{displayedProjects.map((project) => {
											const pathInfo = formatPathWithProject(
												project.mainRepoPath,
												project.name,
												homeDir,
											);
											return (
												<button
													key={project.id}
													type="button"
													onClick={() => handleOpenRecentProject(project.id)}
													disabled={isLoading}
													className="w-full flex justify-between items-center px-2 py-1 rounded-md hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
												>
													<span className="text-foreground text-xs font-normal truncate">
														{project.name}
													</span>
													<Tooltip delayDuration={500}>
														<TooltipTrigger asChild>
															<span className="text-muted-foreground text-xs font-normal truncate ml-4">
																{pathInfo.display}
															</span>
														</TooltipTrigger>
														<TooltipContent
															side="top"
															showArrow={false}
															className="bg-card text-foreground border border-border shadow-md"
														>
															{pathInfo.full}
														</TooltipContent>
													</Tooltip>
												</button>
											);
										})}

										{hasMoreToLoad && (
											<button
												type="button"
												onClick={() => setVisibleCount((c) => c + 50)}
												className="w-full px-2 py-2 text-muted-foreground text-xs font-normal hover:text-foreground transition-colors"
											>
												Load more ({recentProjects.length - visibleCount}{" "}
												remaining)
											</button>
										)}
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Dialogs */}
			<CloneRepoDialog
				isOpen={isCloneDialogOpen}
				onClose={() => setIsCloneDialogOpen(false)}
				onError={setError}
			/>
			<InitGitDialog
				isOpen={initGitDialog.isOpen}
				selectedPath={initGitDialog.selectedPath}
				onClose={() => setInitGitDialog({ isOpen: false, selectedPath: "" })}
				onError={setError}
			/>
		</div>
	);
}
