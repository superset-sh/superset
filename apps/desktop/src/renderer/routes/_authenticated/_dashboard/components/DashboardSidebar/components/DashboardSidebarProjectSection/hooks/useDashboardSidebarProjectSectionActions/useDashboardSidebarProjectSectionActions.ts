import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import type { DashboardSidebarProject } from "../../../../types";
import type { ImportableWorktree } from "../../components/ImportWorktreesDialog";

interface UseDashboardSidebarProjectSectionActionsOptions {
	project: DashboardSidebarProject;
}

export function useDashboardSidebarProjectSectionActions({
	project,
}: UseDashboardSidebarProjectSectionActionsOptions) {
	const { t } = useLingui();
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
	const { submit } = useWorkspaceCreates();
	const importingWorktreesRef = useRef(false);
	// Non-null while the import confirmation dialog is open.
	const [importableWorktrees, setImportableWorktrees] = useState<
		ImportableWorktree[] | null
	>(null);
	const [isImportingWorktrees, setIsImportingWorktrees] = useState(false);
	const { requestSectionRename } = useDashboardSidebarSectionRename();
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
			toast.error(
				t({
					message: "Project's host is unreachable — cannot rename right now",
				}),
			);
			return;
		}
		void getHostServiceClientByUrl(servingHostUrl)
			.project.update.mutate({ projectId: project.id, name: trimmed })
			.catch((err) => {
				toast.error(
					t({
						message: `Rename failed: ${errorMessage(err)}`,
					}),
				);
			});
	};

	const handleOpenInFinder = async () => {
		const hostProject = hostProjects.find(
			(item) => item.projectKey === project.id,
		);
		const localRepoPath =
			machineId && hostProject?.hostIds.includes(machineId)
				? hostProject.repoPath
				: undefined;
		if (!localRepoPath) {
			toast.error(
				t({
					message: "Project folder is not on this machine",
				}),
			);
			return;
		}
		try {
			await electronTrpcClient.external.openInFinder.mutate(localRepoPath);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to open in Finder: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleOpenSettings = () => {
		navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: project.id },
		});
	};

	const confirmRemoveFromSidebar = () => {
		alert({
			title: t({
				message: "Remove project from sidebar?",
			}),
			description: t({
				message:
					"This will remove workspaces from the sidebar and delete all project sections. The workspaces or projects won't be deleted.",
			}),
			actions: [
				{
					label: t({
						message: "Cancel",
					}),
					variant: "outline",
					onClick: () => {},
				},
				{
					label: t({
						message: "Remove",
					}),
					variant: "destructive",
					onClick: () => removeProjectFromSidebar(project.id),
				},
			],
		});
	};

	const handleNewWorkspace = () => {
		openModal(project.id);
	};

	// Menu action: list the worktrees git knows about that have no workspace
	// row yet and open the confirmation dialog.
	const handleImportWorktrees = async () => {
		if (importingWorktreesRef.current) return;
		if (!servingHostUrl) {
			toast.error(
				t({
					message:
						"Project's host is unreachable — cannot import worktrees right now",
				}),
			);
			return;
		}
		try {
			const { worktrees } = await getHostServiceClientByUrl(
				servingHostUrl,
			).workspaceCreation.listProjectWorktrees.query({
				projectId: project.id,
			});
			// `=== false` also skips hosts too old to report tracked-ness.
			const untracked = worktrees.filter(
				(worktree) =>
					worktree.hasWorkspace === false && worktree.isMainWorktree === false,
			);
			if (untracked.length === 0) {
				toast.info(
					t({
						message: "All of this project's worktrees are already tracked",
					}),
				);
				return;
			}
			setImportableWorktrees(untracked);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to list worktrees: ${errorMessage(error)}`,
				}),
			);
		}
	};

	// Dialog confirm: adopt each worktree via the `worktreePath` branch of
	// `workspaces.create` (no `git worktree add`; setup only when opted in).
	const confirmImportWorktrees = async ({
		runSetup,
	}: {
		runSetup: boolean;
	}) => {
		const untracked = importableWorktrees;
		if (importingWorktreesRef.current || !untracked) return;
		if (!servingHostId) {
			toast.error(
				t({
					message:
						"Project's host is unreachable — cannot import worktrees right now",
				}),
			);
			return;
		}
		importingWorktreesRef.current = true;
		setIsImportingWorktrees(true);
		try {
			const outcomes = await Promise.all(
				untracked.map(
					(worktree) =>
						submit({
							hostId: servingHostId,
							snapshot: {
								id: crypto.randomUUID(),
								projectId: project.id,
								branch: worktree.branch,
								worktreePath: worktree.path,
								runSetup,
							},
						}).completed,
				),
			);
			const errors = outcomes.flatMap((outcome) =>
				outcome.ok ? [] : [outcome.error],
			);
			const imported = outcomes.length - errors.length;
			if (errors.length > 0) {
				toast.error(
					t({
						message: `Imported ${imported} of ${untracked.length} worktrees: ${errors[0]}`,
					}),
				);
			} else {
				toast.success(
					t({
						message: plural(imported, {
							one: "Imported # worktree as a workspace",
							other: "Imported # worktrees as workspaces",
						}),
					}),
				);
			}
			setImportableWorktrees(null);
		} finally {
			importingWorktreesRef.current = false;
			setIsImportingWorktrees(false);
		}
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
		confirmImportWorktrees,
		confirmRemoveFromSidebar,
		deleteSection,
		handleImportWorktrees,
		handleNewSection,
		handleNewWorkspace,
		handleOpenInFinder,
		handleOpenSettings,
		importableWorktrees,
		isImportingWorktrees,
		isRenaming,
		renameSection,
		renameValue,
		setImportableWorktrees,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	};
}
