import { toast } from "@superset/ui/sonner";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useResolveNewProjectModal,
} from "renderer/stores/add-repository-modal";
import { NewProjectModal } from "./components/NewProjectModal";

export function AddRepositoryModals() {
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const resolveNewProject = useResolveNewProjectModal();

	return (
		<NewProjectModal
			open={active.kind === "new-project"}
			onOpenChange={(open) => {
				if (!open) close();
			}}
			onSuccess={(result) => {
				toast.success("Project created.");
				resolveNewProject({ projectId: result.projectId });
			}}
			onError={(message) => toast.error(`Create failed: ${message}`)}
		/>
	);
}
