import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuCheck, LuCopy, LuExternalLink, LuUndo2, LuX } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useSidebarFilePolicy } from "renderer/lib/clickPolicy";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";
import type { ChangesetFile } from "../../../../../useChangeset";
import { useDiffHeaderHover } from "../../hooks/useDiffHeaderHover";

interface DiffHeaderMetadataProps {
	file: ChangesetFile;
	workspaceId: string;
	onSetCollapsed: (value: boolean) => void;
	viewed: boolean;
	onSetViewed: (path: string, next: boolean) => void;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onOpenInExternalEditor: (path: string) => void;
	isEditing: boolean;
	isDirty: boolean;
	isSaving: boolean;
	onSaveEditing?: () => void;
	onCancelEditing?: () => void;
}

export function DiffHeaderMetadata({
	file,
	workspaceId,
	onSetCollapsed,
	viewed,
	onSetViewed,
	onOpenFile,
	onOpenInExternalEditor,
	isEditing,
	isDirty,
	isSaving,
	onSaveEditing,
	onCancelEditing,
}: DiffHeaderMetadataProps) {
	const { t } = useLingui();
	const actionsRef = useRef<HTMLDivElement>(null);
	const headerHovered = useDiffHeaderHover(actionsRef);
	const { copyToClipboard, copied } = useCopyToClipboard();
	const policy = useSidebarFilePolicy();

	const handleToggleViewed = useCallback(() => {
		const next = !viewed;
		onSetViewed(file.path, next);
		onSetCollapsed(next);
	}, [viewed, file.path, onSetViewed, onSetCollapsed]);

	const showDeletedFileToast = useCallback(() => {
		toast.error(
			t({
				id: "workspace.diffPane.fileGoneToast",
				message: "File no longer exists",
			}),
			{
				description: t({
					id: "workspace.diffPane.fileGoneBody",
					message: `${file.path} was deleted in this change.`,
				}),
			},
		);
	}, [file.path, t]);

	const handleOpenClick = useCallback(
		(event: React.MouseEvent) => {
			if (file.status === "deleted") {
				showDeletedFileToast();
				return;
			}
			const action = policy.getAction(event);
			if (action === "external") onOpenInExternalEditor(file.path);
			else if (action === "newTab") onOpenFile(file.path, true);
			else if (action === "pane") onOpenFile(file.path, false);
		},
		[
			file.status,
			file.path,
			policy,
			onOpenFile,
			onOpenInExternalEditor,
			showDeletedFileToast,
		],
	);

	const utils = workspaceTrpc.useUtils();
	const discardMutation = workspaceTrpc.git.discardChanges.useMutation({
		onSuccess: () => {
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
			void utils.git.getDiffBulk.invalidate({ workspaceId });
		},
		onError: (err) => {
			toast.error(
				t({
					id: "workspace.diffPane.discardFailedToast",
					message: "Couldn't discard changes",
				}),
				{
					description: errorMessage(err),
				},
			);
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
			<div
				ref={actionsRef}
				className={cn(
					"-mr-1 flex shrink-0 items-center gap-1 transition-opacity duration-100",
					!isEditing && !headerHovered && "pointer-events-none opacity-0",
				)}
				data-diff-actions
				data-editing={isEditing ? "" : undefined}
			>
				{isEditing && onSaveEditing && onCancelEditing ? (
					<>
						<output
							className={cn(
								"size-1.5 rounded-full transition-colors",
								isDirty ? "bg-amber-500" : "bg-muted-foreground/30",
							)}
							aria-label={
								isDirty
									? t({
											id: "workspace.diffPane.unsavedChangesAria",
											message: "Unsaved changes",
										})
									: t({
											id: "workspace.diffPane.allChangesSavedAria",
											message: "All changes saved",
										})
							}
						/>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onSaveEditing}
									aria-label={t({
										id: "workspace.diffPane.saveEditsAria",
										message: "Save edits",
									})}
									disabled={!isDirty || isSaving}
									className="rounded bg-accent p-1 text-foreground transition-colors hover:bg-accent/80 disabled:opacity-40"
								>
									<LuCheck className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<Trans id="workspace.diffPane.saveEdits">Save edits (⌘S)</Trans>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onCancelEditing}
									aria-label={t({
										id: "workspace.diffPane.cancelEditsAria",
										message: "Cancel edits",
									})}
									className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
								>
									<LuX className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<Trans id="workspace.diffPane.cancelEdits">Cancel edits</Trans>
							</TooltipContent>
						</Tooltip>
					</>
				) : (
					<>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => void copyToClipboard(file.path)}
									aria-label={t({
										id: "workspace.diffPane.copyPathAria",
										message: "Copy path",
									})}
									className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
								>
									{copied ? (
										<LuCheck className="size-3.5" />
									) : (
										<LuCopy className="size-3.5" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{copied ? (
									<Trans id="workspace.diffPane.pathCopied">Copied</Trans>
								) : (
									<Trans id="workspace.diffPane.copyPath">Copy path</Trans>
								)}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleOpenClick}
									aria-label={t({
										id: "workspace.diffPane.openInFileViewerAria",
										message: "Open in file viewer",
									})}
									className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
								>
									<LuExternalLink className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">{policy.hint}</TooltipContent>
						</Tooltip>
						{requestDiscard ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={requestDiscard}
										aria-label={t({
											id: "workspace.diffPane.discardChangesAria",
											message: "Discard changes",
										})}
										data-discard-button
										className="rounded p-1 text-muted-foreground/60 transition-all hover:bg-accent hover:text-destructive"
									>
										<LuUndo2 className="size-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<Trans id="workspace.diffPane.discardChanges">
										Discard changes
									</Trans>
								</TooltipContent>
							</Tooltip>
						) : null}
						<button
							type="button"
							onClick={handleToggleViewed}
							aria-pressed={viewed}
							className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							{viewed ? <LuCheck className="size-3.5" /> : null}
							{viewed ? (
								<Trans id="workspace.diffPane.markedAsViewed">
									Marked as viewed
								</Trans>
							) : (
								<Trans id="workspace.diffPane.markAsViewed">
									Mark as viewed
								</Trans>
							)}
						</button>
					</>
				)}
			</div>
			{canDiscard ? (
				<DiscardConfirmDialog
					open={showDiscardConfirm}
					onOpenChange={setShowDiscardConfirm}
					title={
						isDeleteAction
							? t({
									id: "workspace.diffPane.deleteFileTitle",
									message: `Delete "${basename}"?`,
								})
							: t({
									id: "workspace.diffPane.discardFileTitle",
									message: `Discard changes to "${basename}"?`,
								})
					}
					description={
						isDeleteAction
							? t({
									id: "workspace.diffPane.deleteFileBody",
									message:
										"This will permanently delete this file. This action cannot be undone.",
								})
							: t({
									id: "workspace.diffPane.discardFileBody",
									message:
										"This will revert all changes to this file. This action cannot be undone.",
								})
					}
					confirmLabel={
						isDeleteAction
							? t({ id: "workspace.diffPane.deleteConfirm", message: "Delete" })
							: t({
									id: "workspace.diffPane.discardConfirm",
									message: "Discard",
								})
					}
					onConfirm={confirmDiscard}
				/>
			) : null}
		</>
	);
}
