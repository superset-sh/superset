interface OpenWorkspaceData {
	workspace: { id: string };
	initialCommands?: string[] | null;
}

interface BootstrapOpenWorktreeOptions {
	data: OpenWorkspaceData;
	invalidateWorkspaces: () => Promise<unknown>;
	invalidateRecentProjects: () => Promise<unknown>;
	addTab: (workspaceId: string) => { tabId: string; paneId: string };
	setTabAutoTitle: (tabId: string, title: string) => void;
	createOrAttach: (input: {
		paneId: string;
		tabId: string;
		workspaceId: string;
	}) => Promise<unknown>;
	writeToTerminal: (input: {
		paneId: string;
		data: string;
		throwOnError?: boolean;
	}) => Promise<unknown>;
	navigateToWorkspaceById: (workspaceId: string) => void;
	logPrefix: string;
}

export async function bootstrapOpenWorktree(
	options: BootstrapOpenWorktreeOptions,
): Promise<void> {
	await options.invalidateWorkspaces();
	await options.invalidateRecentProjects();

	const initialCommands =
		Array.isArray(options.data.initialCommands) &&
		options.data.initialCommands.length > 0
			? options.data.initialCommands
			: undefined;

	const { tabId, paneId } = options.addTab(options.data.workspace.id);
	if (initialCommands) {
		options.setTabAutoTitle(tabId, "Workspace Setup");
	}

	try {
		await options.createOrAttach({
			paneId,
			tabId,
			workspaceId: options.data.workspace.id,
		});
		if (initialCommands) {
			await options.writeToTerminal({
				paneId,
				data: `${initialCommands.join(" && ")}\n`,
				throwOnError: true,
			});
		}
	} catch (error) {
		console.error(
			`[${options.logPrefix}] Failed to bootstrap terminal:`,
			error,
		);
	}

	options.navigateToWorkspaceById(options.data.workspace.id);
}
