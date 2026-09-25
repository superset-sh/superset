import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useFolderImportIntent } from "renderer/stores/folder-import-intent";

export function FolderImportMount() {
	const { t } = useLingui();
	const tick = useFolderImportIntent((s) => s.tick);
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(
				t({
					message: `Import failed: ${message}`,
				}),
			);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error(
				t({
					message: "Import failed",
				}),
				{
					description: t({
						message: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
					}),
					action: {
						label: t({
							message: "Open Projects",
						}),
						onClick: () => navigate({ to: "/settings/projects" }),
					},
				},
			);
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
				toast.success(
					t({
						message: "Project ready — open it from the sidebar.",
					}),
				);
			}
		});
	}, [tick, t]);

	return null;
}
