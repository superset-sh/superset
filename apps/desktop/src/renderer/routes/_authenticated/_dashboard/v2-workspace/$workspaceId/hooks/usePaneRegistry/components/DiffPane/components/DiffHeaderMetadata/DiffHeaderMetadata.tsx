import { Checkbox } from "@superset/ui/checkbox";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useId, useMemo, useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy, LuUndo2 } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useSidebarFilePolicy } from "renderer/lib/clickPolicy";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import type { ChangesetFile } from "../../../../../useChangeset";

interface DiffHeaderMetadataProps {
	file: ChangesetFile;
	workspaceId: string;
	onSetCollapsed: (value: boolean) => void;
	viewed: boolean;
	onSetViewed: (path: string, next: boolean) => void;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onOpenInExternalEditor: (path: string) => void;
}

export function DiffHeaderMetadata({
	file,
	workspaceId,
	onSetCollapsed,
	viewed,
	onSetViewed,
	onOpenFile,
	onOpenInExternalEditor,
}: DiffHeaderMetadataProps) {
	const viewedId = useId();
	const { copyToClipboard, copied } = useCopyToClipboard();
	const policy = useSidebarFilePolicy();

	const handleToggleViewed = useCallback(() => {
		const next = !viewed;
		onSetViewed(file.path, next);
		onSetCollapsed(next);
	}, [viewed, file.path, onSetViewed, onSetCollapsed]);

	const showDeletedFileToast = useCallback(() => {
		toast.error("File no longer exists", {
			description: `${file.path} was deleted in this change.`,
		});
	}, [file.path]);

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
			<div className="flex shrink-0 items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenClick}
							aria-label="Open in file viewer"
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
						>
							<LuArrowUpRight className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{policy.hint}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => void copyToClipboard(file.path)}
							aria-label="Copy path"
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
						>
							{copied ? (
								<LuCheck className="size-3.5" />
							) : (
								<LuCopy className="size-3.5" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{copied ? "Copied" : "Copy path"}
					</TooltipContent>
				</Tooltip>
				<StatusIndicator status={file.status} iconClassName="size-3.5" />
				<div className="flex items-center gap-1">
					<Checkbox
						id={viewedId}
						checked={viewed}
						onCheckedChange={() => handleToggleViewed()}
						className="size-3 border-muted-foreground/50"
					/>
					<label
						htmlFor={viewedId}
						className="hidden cursor-pointer select-none text-xs text-muted-foreground @min-[380px]/diff-header:inline"
					>
						Viewed
					</label>
				</div>
				{requestDiscard ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={requestDiscard}
								aria-label="Discard changes"
								data-discard-button
								className="rounded p-1 text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-destructive"
							>
								<LuUndo2 className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							Discard changes
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
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
