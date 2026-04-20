import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useFolderImportTrigger,
} from "renderer/stores/add-repository-modal";
import { FolderFirstImportModal } from "./components/FolderFirstImportModal";
import { NewProjectModal } from "./components/NewProjectModal";
import { useFolderFirstImport } from "./hooks/useFolderFirstImport";

// Mounted once at the dashboard layout so modal state lives in one place
// and concurrent triggers can't race the folder-first state machine.
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

	// A counter (not boolean) so successive clicks re-invoke. Depend only on
	// the counter — folderImport.start's identity changes every render, so
	// including it would refire the effect mid-flow and re-open the picker.
	const startRef = useRef(folderImport.start);
	startRef.current = folderImport.start;
	useEffect(() => {
		if (folderImportTrigger === 0) return;
		startRef.current().catch((err) => {
			toast.error(
				`Import failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		});
	}, [folderImportTrigger]);

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
			<FolderFirstImportModal
				state={folderImport.state}
				onCancel={folderImport.cancel}
				onConfirmCreateAsNew={folderImport.confirmCreateAsNew}
			/>
		</>
	);
}
