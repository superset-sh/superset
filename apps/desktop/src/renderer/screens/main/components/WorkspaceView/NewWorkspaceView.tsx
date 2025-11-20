import { trpc } from "renderer/lib/trpc";
import { useAddTab } from "renderer/stores";
import { useOpenProject, useOpenRecent, useRemoveRecent } from "renderer/react-query/projects";
import { useUpdateWorkspace } from "renderer/react-query/workspaces";
import { StartSection } from "./NewWorkspaceView/components/StartSection";
import { RecentSection } from "./NewWorkspaceView/components/RecentSection";

export function NewWorkspaceView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const addTab = useAddTab();

	const { data: recents = [] } = trpc.projects.getRecents.useQuery();

	const updateWorkspace = useUpdateWorkspace();

	const openProject = useOpenProject({
		onSuccess: async (result) => {
			if (result.success && activeWorkspace) {
				// Update workspace in DB with path and wait for it to complete
				await updateWorkspace.mutateAsync({
					id: activeWorkspace.id,
					patch: {
						path: result.path,
						name: result.name,
					},
				});

				// Add a tab for the project (still using Zustand for now)
				addTab(activeWorkspace.id);
			}
		},
	});

	const openRecent = useOpenRecent({
		onSuccess: async (result) => {
			if (result.success && activeWorkspace) {
				// Update workspace in DB with path and wait for it to complete
				await updateWorkspace.mutateAsync({
					id: activeWorkspace.id,
					patch: {
						path: result.path,
						name: result.name,
					},
				});

				// Add a tab for the project (still using Zustand for now)
				addTab(activeWorkspace.id);
			}
		},
	});

	const removeRecent = useRemoveRecent();

	const handleOpenProject = () => {
		openProject.mutate();
	};

	const handleOpenRecent = (path: string) => {
		openRecent.mutate({ path });
	};

	const handleRemoveRecent = (path: string) => {
		removeRecent.mutate({ path });
	};

	return (
		<div className="flex-1 h-full flex">
			{/* Left column - Start and Recent sections */}
			<div className="w-[400px] p-8 border-r border-border overflow-auto">
				<div className="mb-2">
					<h1 className="text-2xl font-bold text-foreground mb-1">
						Welcome to Superset
					</h1>
					<p className="text-sm text-muted-foreground">
						Open a project to get started
					</p>
				</div>

				<div className="mt-8">
					<StartSection
						onOpenProject={handleOpenProject}
						isLoading={openProject.isPending}
					/>

					<RecentSection
						recents={recents}
						onOpenRecent={handleOpenRecent}
						onRemoveRecent={handleRemoveRecent}
					/>
				</div>
			</div>

			{/* Right column - Placeholder for future content */}
			<div className="flex-1 flex items-center justify-center p-8">
				<div className="text-center max-w-md">
					<p className="text-muted-foreground">
						Quick actions and walkthroughs will appear here
					</p>
				</div>
			</div>
		</div>
	);
}
