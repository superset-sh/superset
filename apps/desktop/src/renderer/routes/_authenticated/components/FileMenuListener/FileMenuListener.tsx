import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";

export function FileMenuListener() {
	const navigate = useNavigate();
	const { t } = useLingui();
	const openNewWorkspace = useOpenNewWorkspace();
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

	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: async (event) => {
			if (event.type !== "open-project") return;
			const result = await folderImport.start();
			if (result) {
				openNewWorkspace(result.projectId);
				toast.success(t({ message: "Project imported and selected." }));
			}
		},
	});

	return null;
}
