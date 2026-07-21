import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useFolderImportIntent } from "renderer/stores/folder-import-intent";

export function FolderImportMount() {
	const tick = useFolderImportIntent((s) => s.tick);
	const navigate = useNavigate();
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
	const folderImportRef = useRef(folderImport);
	folderImportRef.current = folderImport;
	// Seed with the mount-time tick so a remount doesn't replay an import
	// triggered earlier in the session.
	const lastTickRef = useRef(tick);

	useEffect(() => {
		if (tick === lastTickRef.current) return;
		lastTickRef.current = tick;
		void folderImportRef.current.start().then((result) => {
			if (result) {
				toast.success("Project ready — open it from the sidebar.");
			}
		});
	}, [tick]);

	return null;
}
