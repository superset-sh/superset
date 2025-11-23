import { FolderGit, FolderOpen, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ActionCard } from "./ActionCard";

export function StartView() {
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const openNew = useOpenNew();
	const createWorkspace = useCreateWorkspace();
	const [error, setError] = useState<string | null>(null);

	const handleOpenProject = () => {
		setError(null);
		openNew.mutate(undefined, {
			onSuccess: (result) => {
				if (result.success && result.project) {
					createWorkspace.mutate({ projectId: result.project.id });
				} else if (!result.success && result.error) {
					setError(result.error);
				}
			},
			onError: (err) => {
				setError(err.message || "Failed to open project");
			},
		});
	};

	const handleOpenRecentProject = (projectId: string) => {
		setError(null);
		createWorkspace.mutate(
			{ projectId },
			{
				onError: (err) => {
					setError(err.message || "Failed to create workspace");
				},
			},
		);
	};

	const displayedProjects = recentProjects.slice(0, 5);
	const isLoading = openNew.isPending || createWorkspace.isPending;

	return (
		<div className="flex h-screen w-screen items-center justify-center bg-[#151110]">
			<div className="flex flex-col items-center w-full max-w-3xl px-8">
				{/* Logo */}
				<h1 className="text-8xl font-normal tracking-normal text-foreground font-micro">
					SUPERSET
				</h1>

				{/* Error Display */}
				{error && (
					<div className="w-full rounded-lg border border-red-500/50 bg-red-500/10 p-4">
						<p className="text-sm text-red-500">{error}</p>
					</div>
				)}

				{/* Action Cards and Recent Projects Container */}
				<div className="flex flex-col items-center gap-0 w-full px-2">
					{/* Action Cards */}
					<div className="w-full max-w-[650px] min-w-[526px] inline-flex justify-center items-center gap-4 px-2">
						<ActionCard
							icon={FolderOpen}
							label="Open project"
							onClick={handleOpenProject}
							isLoading={isLoading}
						/>

						<ActionCard
							icon={FolderGit}
							label="Clone repo"
							disabled
						/>

						<ActionCard
							icon={SquareTerminal}
							label="Connect via SSH"
							disabled
						/>
					</div>

					{/* Recent Projects */}
					{displayedProjects.length > 0 && (
						<div className="w-full max-w-[650px] min-w-[526px] inline-flex justify-center items-center gap-4 ">
							<div className="flex-1 p-1 py-4 rounded-lg inline-flex flex-col justify-start items-start gap-1 overflow-hidden">
								<div className="self-stretch inline-flex justify-between items-start">
									<div className="flex justify-center items-center gap-2.5">
										<div className="justify-start text-[#a8a5a3] text-xs px-2 font-normal">
											Recent projects
										</div>
									</div>
									{recentProjects.length > 5 && (
										<div className="flex justify-center items-center gap-2.5">
											<div className="justify-start text-[#a8a5a3] text-xs font-normal">
												View all ({recentProjects.length})
											</div>
										</div>
									)}
								</div>

								{displayedProjects.map((project) => (
									<button
										key={project.id}
										type="button"
										onClick={() => handleOpenRecentProject(project.id)}
										disabled={isLoading}
										className="self-stretch inline-flex justify-between items-center px-2 py-1 rounded-md hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
									>
										<div className="flex justify-center items-center gap-2.5">
											<div className="justify-start text-[#eae8e6] text-sm font-normal">
												{project.name}
											</div>
										</div>
										<div className="flex justify-center items-center gap-2.5">
											<div className="justify-start text-[#a8a5a3] text-xs font-normal">
												{project.mainRepoPath}
											</div>
										</div>
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

