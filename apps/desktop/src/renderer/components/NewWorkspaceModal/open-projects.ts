export async function openProjectsAndWorkspaces({
	openNew,
	openMainRepoWorkspace,
	onProjectOpenError,
}: {
	openNew: () => Promise<Array<{ id: string; name: string }>>;
	openMainRepoWorkspace: (input: { projectId: string }) => Promise<unknown>;
	onProjectOpenError: (projectName: string, error: unknown) => void;
}): Promise<void> {
	const projects = await openNew();
	for (const project of projects) {
		try {
			await openMainRepoWorkspace({
				projectId: project.id,
			});
		} catch (error) {
			onProjectOpenError(project.name, error);
		}
	}
}
