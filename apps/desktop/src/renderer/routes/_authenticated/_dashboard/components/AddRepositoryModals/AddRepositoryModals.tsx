import { toast } from "@superset/ui/sonner";
import { useEffect } from "react";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useFolderImportTrigger,
} from "renderer/stores/add-repository-modal";
import { FolderFirstImportModal } from "../../v2-workspaces/components/FolderFirstImportModal";
import { NewProjectModal } from "../../v2-workspaces/components/NewProjectModal";
import { PinAndSetupModal } from "../../v2-workspaces/components/PinAndSetupModal";
import { useFolderFirstImport } from "../../v2-workspaces/hooks/useFolderFirstImport";

/**
 * Layout-level host for the three add-repository flows (New project, Import
 * existing folder, Pin & set up). Any component in the dashboard can open
 * one via the `useAddRepositoryModalStore` actions — sidebar dropdown,
 * workspaces-tab Available rows, future empty-state CTAs, etc.
 *
 * Why centralize: modal state lives once per app, not once per trigger.
 * Also keeps the folder-first picker's internal state machine in one place
 * so nothing races if two triggers happen quickly.
 */
export function AddRepositoryModals() {
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const folderImportTrigger = useFolderImportTrigger();

	const folderImport = useFolderFirstImport({
		onSuccess: () => {
			toast.success("Project ready — open it from the sidebar.");
		},
		onError: (message) => {
			toast.error(`Import failed: ${message}`);
		},
	});

	// Run the folder-first picker when the store's trigger counter bumps.
	// Using a counter (vs a boolean) lets successive clicks re-invoke the
	// flow after the previous one resolves.
	useEffect(() => {
		if (folderImportTrigger === 0) return;
		void folderImport.start();
		// We intentionally depend only on the counter — folderImport.start's
		// identity changes every render (new hook instance per render) and
		// we don't want to restart the flow on those changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [folderImportTrigger, folderImport.start]);

	return (
		<>
			<NewProjectModal
				open={active.kind === "new-project"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={() => toast.success("Project created.")}
				onError={(message) => toast.error(`Create failed: ${message}`)}
			/>
			<PinAndSetupModal
				project={active.kind === "pin-and-setup" ? active.target : null}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={() => toast.success("Project pinned and set up.")}
				onError={(message) => toast.error(`Setup failed: ${message}`)}
			/>
			<FolderFirstImportModal
				state={folderImport.state}
				onCancel={folderImport.cancel}
				onConfirmCreateAsNew={folderImport.confirmCreateAsNew}
				onConfirmPickCandidate={folderImport.confirmPickCandidate}
				onConfirmRepoint={folderImport.confirmRepoint}
			/>
		</>
	);
}
