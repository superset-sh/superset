import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

export function useSectionMutations(sectionId: string) {
	const utils = electronTrpc.useUtils();
	const onSuccess = () => utils.workspaces.getAllGrouped.invalidate();

	const toggleCollapsed =
		electronTrpc.workspaces.toggleSectionCollapsed.useMutation({
			onSuccess,
			onError: (error) =>
				toast.error(`Failed to toggle section: ${error.message}`),
		});

	const renameSection = electronTrpc.workspaces.renameSection.useMutation({
		onSuccess,
		onError: (error) =>
			toast.error(`Failed to rename section: ${error.message}`),
	});

	const deleteSection = electronTrpc.workspaces.deleteSection.useMutation({
		onSuccess,
		onError: (error) =>
			toast.error(`Failed to delete section: ${error.message}`),
	});

	const setSectionColor = electronTrpc.workspaces.setSectionColor.useMutation({
		onSuccess,
		onError: (error) => toast.error(`Failed to set color: ${error.message}`),
	});

	return {
		toggle: () => toggleCollapsed.mutate({ id: sectionId }),
		rename: (name: string) => renameSection.mutate({ id: sectionId, name }),
		remove: () => deleteSection.mutate({ id: sectionId }),
		setColor: (color: string) =>
			setSectionColor.mutate({
				id: sectionId,
				color: color === PROJECT_COLOR_DEFAULT ? null : color,
			}),
		isDeleting: deleteSection.isPending,
	};
}
