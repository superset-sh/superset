import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useV2ProjectLocalMetaStore } from "renderer/stores/v2-project-local-meta";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type { DashboardSidebarProject } from "../../../../types";

interface UseDashboardSidebarProjectSectionActionsOptions {
	project: DashboardSidebarProject;
}

export function useDashboardSidebarProjectSectionActions({
	project,
}: UseDashboardSidebarProjectSectionActionsOptions) {
	const openModal = useOpenNewWorkspaceModal();
	const navigate = useNavigate();
	// Renames commit on a host serving the project — host.db owns the name.
	// Prefer the local host when it serves the project (always reachable);
	// hostIds order is arbitrary and may lead with an offline remote.
	const { projects: hostProjects } = useHostProjects();
	const { machineId } = useLocalHostService();
	const servingHostId = useMemo(() => {
		const hostIds =
			hostProjects.find((item) => item.projectKey === project.id)?.hostIds ??
			[];
		if (machineId && hostIds.includes(machineId)) return machineId;
		return hostIds[0] ?? null;
	}, [hostProjects, machineId, project.id]);
	// undefined (not null) when no host serves it — null would resolve to
	// the local host and rename the wrong replica.
	const servingHostUrl = useHostUrl(servingHostId ?? undefined);
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const projectColor = useV2ProjectLocalMetaStore(
		(state) => state.projects[project.id]?.color ?? PROJECT_COLOR_DEFAULT,
	);
	const setProjectColor = useV2ProjectLocalMetaStore(
		(state) => state.setProjectColor,
	);
	const {
		createSection,
		deleteSection,
		removeProjectFromSidebar,
		renameSection,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(project.name);

	const startRename = () => {
		setRenameValue(project.name);
		setIsRenaming(true);
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(project.name);
	};

	const submitRename = () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === project.name) return;
		if (!servingHostUrl) {
			toast.error("Project's host is unreachable — cannot rename right now");
			return;
		}
		void getHostServiceClientByUrl(servingHostUrl)
			.project.update.mutate({ projectId: project.id, name: trimmed })
			.catch((err) => {
				toast.error(
					`Rename failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			});
	};

	const handleSetColor = (color: string) => {
		setProjectColor(project.id, color);
	};

	const handleOpenInFinder = () => {
		toast.info("Open in Finder is coming soon");
	};

	const handleOpenSettings = () => {
		navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: project.id },
		});
	};

	const confirmRemoveFromSidebar = () => {
		alert({
			title: "Remove project from sidebar?",
			description:
				"This will remove workspaces from the sidebar and delete all project sections. The workspaces or projects won't be deleted.",
			actions: [
				{ label: "Cancel", variant: "outline", onClick: () => {} },
				{
					label: "Remove",
					variant: "destructive",
					onClick: () => removeProjectFromSidebar(project.id),
				},
			],
		});
	};

	const handleNewWorkspace = () => {
		openModal(project.id);
	};

	const handleNewSection = () => {
		const sectionId = createSection(project.id);
		requestSectionRename(sectionId);
		if (project.isCollapsed) {
			toggleProjectCollapsed(project.id);
		}
	};

	return {
		cancelRename,
		confirmRemoveFromSidebar,
		deleteSection,
		handleNewSection,
		handleNewWorkspace,
		handleOpenInFinder,
		handleOpenSettings,
		handleSetColor,
		isRenaming,
		projectColor,
		renameSection,
		renameValue,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	};
}
