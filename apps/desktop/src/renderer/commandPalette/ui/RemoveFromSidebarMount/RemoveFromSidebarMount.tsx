import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useCallback } from "react";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";

export function RemoveFromSidebarMount() {
	const target = useRemoveFromSidebarIntent((s) => s.target);
	const clear = useRemoveFromSidebarIntent((s) => s.clear);
	const { hideWorkspaceInSidebar, removeWorkspaceFromSidebar } =
		useDashboardSidebarState();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) clear();
		},
		[clear],
	);

	const handleConfirm = useCallback(() => {
		if (!target) return;
		navigateAwayFromWorkspace(target.workspaceId);
		if (target.isMain) {
			hideWorkspaceInSidebar(target.workspaceId, target.projectId);
		} else {
			removeWorkspaceFromSidebar(target.workspaceId);
		}
		clear();
	}, [
		target,
		navigateAwayFromWorkspace,
		hideWorkspaceInSidebar,
		removeWorkspaceFromSidebar,
		clear,
	]);

	return (
		<AlertDialog open={!!target} onOpenChange={handleOpenChange}>
			<AlertDialogContent className="max-w-[360px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Remove "{target?.workspaceName ?? "workspace"}" from sidebar?
					</AlertDialogTitle>
					<AlertDialogDescription>
						The workspace itself isn't deleted — you can always add it back from
						the Workspaces page.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => handleOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleConfirm}
					>
						Remove
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
