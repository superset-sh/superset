import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo, useState } from "react";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";
import type { ChangesetFile } from "../../../../../useChangeset";
import { DiffFileHeader } from "../DiffFileHeader";

interface DiffCodeViewHeaderProps {
	file: ChangesetFile;
	workspaceId: string;
	collapsed: boolean;
	onSetCollapsed: (path: string, value: boolean) => void;
	expandUnchanged: boolean;
	onToggleExpandUnchanged: () => void;
	viewed: boolean;
	onSetViewed: (path: string, next: boolean) => void;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onOpenInExternalEditor: (path: string) => void;
}

export function DiffCodeViewHeader({
	file,
	workspaceId,
	collapsed,
	onSetCollapsed,
	expandUnchanged,
	onToggleExpandUnchanged,
	viewed,
	onSetViewed,
	onOpenFile,
	onOpenInExternalEditor,
}: DiffCodeViewHeaderProps) {
	const handleToggleCollapsed = useCallback(
		() => onSetCollapsed(file.path, !collapsed),
		[onSetCollapsed, file.path, collapsed],
	);
	const handleToggleViewed = useCallback(() => {
		const next = !viewed;
		onSetViewed(file.path, next);
		onSetCollapsed(file.path, next);
	}, [viewed, file.path, onSetViewed, onSetCollapsed]);
	const showDeletedFileToast = useCallback(() => {
		toast.error("File no longer exists", {
			description: `${file.path} was deleted in this change.`,
		});
	}, [file.path]);
	const handleOpenFile = useCallback(
		(openInNewTab?: boolean) => {
			if (file.status === "deleted") {
				showDeletedFileToast();
				return;
			}
			onOpenFile(file.path, openInNewTab);
		},
		[file.status, file.path, onOpenFile, showDeletedFileToast],
	);
	const handleOpenInExternalEditor = useCallback(() => {
		if (file.status === "deleted") {
			showDeletedFileToast();
			return;
		}
		onOpenInExternalEditor(file.path);
	}, [file.status, file.path, onOpenInExternalEditor, showDeletedFileToast]);

	const utils = workspaceTrpc.useUtils();
	const discardMutation = workspaceTrpc.git.discardChanges.useMutation({
		onSuccess: () => {
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		onError: (err) => {
			toast.error("Couldn't discard changes", { description: err.message });
		},
	});
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
	const canDiscard = file.source.kind === "unstaged";
	const requestDiscard = useMemo(() => {
		if (!canDiscard) return undefined;
		return () => setShowDiscardConfirm(true);
	}, [canDiscard]);
	const confirmDiscard = useCallback(() => {
		setShowDiscardConfirm(false);
		discardMutation.mutate({ workspaceId, filePath: file.path });
	}, [discardMutation, workspaceId, file.path]);
	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const basename = file.path.split("/").pop() ?? file.path;

	return (
		<>
			<DiffFileHeader
				path={file.path}
				status={file.status}
				additions={file.additions}
				deletions={file.deletions}
				expandUnchanged={expandUnchanged}
				onToggleExpandUnchanged={onToggleExpandUnchanged}
				collapsed={collapsed}
				onToggleCollapsed={handleToggleCollapsed}
				viewed={viewed}
				onToggleViewed={handleToggleViewed}
				onOpenFile={handleOpenFile}
				onOpenInExternalEditor={handleOpenInExternalEditor}
				onDiscard={requestDiscard}
			/>
			{canDiscard ? (
				<DiscardConfirmDialog
					open={showDiscardConfirm}
					onOpenChange={setShowDiscardConfirm}
					title={
						isDeleteAction
							? `Delete "${basename}"?`
							: `Discard changes to "${basename}"?`
					}
					description={
						isDeleteAction
							? "This will permanently delete this file. This action cannot be undone."
							: "This will revert all changes to this file. This action cannot be undone."
					}
					confirmLabel={isDeleteAction ? "Delete" : "Discard"}
					onConfirm={confirmDiscard}
				/>
			) : null}
		</>
	);
}
