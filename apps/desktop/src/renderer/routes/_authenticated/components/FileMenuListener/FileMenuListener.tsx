import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useOpenNewWorkspaceForLocalProject } from "renderer/hooks/useOpenNewWorkspace";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";

export function FileMenuListener() {
	const navigate = useNavigate();
	const { t } = useLingui();
	const openNewWorkspace = useOpenNewWorkspaceForLocalProject();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(`Import failed: ${message}`);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error("Import failed", {
				description: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
				action: {
					label: "Open Projects",
					onClick: () => navigate({ to: "/settings/projects" }),
				},
			});
		},
	});

	const openProject = async () => {
		const result = await folderImport.start();
		if (result) {
			openNewWorkspace(result.projectId);
			toast.success(t({ message: "Project imported and selected." }));
		}
	};

	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-project") void openProject();
		},
	});

	useHotkey("OPEN_PROJECT", () => void openProject());

	return null;
}
