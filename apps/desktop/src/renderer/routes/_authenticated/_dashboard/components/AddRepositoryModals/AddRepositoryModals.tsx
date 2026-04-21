import { toast } from "@superset/ui/sonner";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
} from "renderer/stores/add-repository-modal";
import { NewProjectModal } from "./components/NewProjectModal";

export function AddRepositoryModals() {
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();

	return (
		<NewProjectModal
			open={active.kind === "new-project"}
			onOpenChange={(open) => {
				if (!open) close();
			}}
			onSuccess={() => toast.success("Project created.")}
			onError={(message) => toast.error(`Create failed: ${message}`)}
		/>
	);
}
