import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { EmptyProjectModal } from "renderer/routes/_authenticated/components/EmptyProjectModal";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/TemplateGalleryModal";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useResolveNewProjectModal,
} from "renderer/stores/add-repository-modal";
import { NewProjectModal } from "./components/NewProjectModal";

export function AddRepositoryModals() {
	const { t } = useLingui();
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const resolveNewProject = useResolveNewProjectModal();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const openNewWorkspace = useOpenNewWorkspace();

	const handleProjectCreated = (result: { projectId: string }) => {
		toast.success(t({ message: "Project created." }));
		resolveNewProject(result);
		if (isV2CloudEnabled) openNewWorkspace(result.projectId);
	};

	return (
		<>
			<EmptyProjectModal
				open={active.kind === "empty-project"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={handleProjectCreated}
				onError={(message) =>
					toast.error(
						t({
							message: `Create failed: ${message}`,
						}),
					)
				}
			/>
			<NewProjectModal
				open={active.kind === "new-project"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={handleProjectCreated}
				onError={(message) =>
					toast.error(
						t({
							message: `Create failed: ${message}`,
						}),
					)
				}
			/>
			<TemplateGalleryModal
				open={active.kind === "template-gallery"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onCreated={handleProjectCreated}
				onError={(message) =>
					toast.error(
						t({
							message: `Create failed: ${message}`,
						}),
					)
				}
			/>
		</>
	);
}
