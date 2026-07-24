import { toast } from "@superset/ui/sonner";
import { EmptyProjectModal } from "renderer/routes/_authenticated/components/EmptyProjectModal";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/TemplateGalleryModal";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useResolveNewProjectModal,
} from "renderer/stores/add-repository-modal";
import { GitInitConfirmDialog } from "./components/GitInitConfirmDialog";
import { NewProjectModal } from "./components/NewProjectModal";

export function AddRepositoryModals() {
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const resolveNewProject = useResolveNewProjectModal();

	return (
		<>
			<EmptyProjectModal
				open={active.kind === "empty-project"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={(result) => {
					toast.success("Project created.");
					resolveNewProject({ projectId: result.projectId });
				}}
				onError={(message) => toast.error(`Create failed: ${message}`)}
			/>
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
			<TemplateGalleryModal
				open={active.kind === "template-gallery"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onCreated={(result) => {
					toast.success("Project created.");
					resolveNewProject({ projectId: result.projectId });
				}}
				onError={(message) => toast.error(`Create failed: ${message}`)}
			/>
			<GitInitConfirmDialog />
		</>
	);
}
