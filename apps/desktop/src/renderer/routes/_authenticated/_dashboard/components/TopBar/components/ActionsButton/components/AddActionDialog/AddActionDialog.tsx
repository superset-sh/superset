import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { getIconComponent, IconPicker } from "renderer/components/IconPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateProjectScriptQueries } from "renderer/lib/project-scripts";
import type { ActionIconKey, WorkspaceAction } from "shared/types/config";
import { v4 as uuidv4 } from "uuid";

interface AddActionDialogProps {
	open: boolean;
	onClose: () => void;
	projectId: string | null | undefined;
	existingActions: WorkspaceAction[];
}

export function AddActionDialog({
	open,
	onClose,
	projectId,
	existingActions,
}: AddActionDialogProps) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const updateActionsMutation = electronTrpc.config.updateActions.useMutation();

	const [name, setName] = useState("");
	const [command, setCommand] = useState("");
	const [icon, setIcon] = useState<ActionIconKey>("run");
	const [isSaving, setIsSaving] = useState(false);

	const reset = useCallback(() => {
		setName("");
		setCommand("");
		setIcon("run");
		setIsSaving(false);
	}, []);

	const handleClose = useCallback(() => {
		reset();
		onClose();
	}, [reset, onClose]);

	const handleSave = useCallback(async () => {
		if (!name.trim() || !command.trim() || !projectId) return;
		setIsSaving(true);
		try {
			const newAction: WorkspaceAction = {
				id: uuidv4(),
				name: name.trim(),
				command: command.trim(),
				icon,
			};
			const updated = [...existingActions, newAction];
			await updateActionsMutation.mutateAsync({
				projectId,
				actions: updated,
			});
			await invalidateProjectScriptQueries(utils, projectId);
			toast.success(`Action "${name.trim()}" saved`);
			handleClose();
		} catch (err) {
			console.error("[add-action] Failed to save:", err);
			setIsSaving(false);
		}
	}, [
		name,
		command,
		icon,
		projectId,
		existingActions,
		updateActionsMutation,
		utils,
		handleClose,
	]);

	const handleEnvironmentSettings = useCallback(() => {
		if (!projectId) return;
		handleClose();
		void navigate({
			to: "/settings/project/$projectId/general",
			params: { projectId },
			hash: "actions",
		});
	}, [navigate, projectId, handleClose]);

	const PreviewIcon = getIconComponent(icon);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
			<DialogContent className="max-w-md p-6 gap-0">
				{/* Top icon */}
				<div className="flex items-center justify-center size-12 rounded-xl bg-muted mb-4 shrink-0">
					<PreviewIcon className="size-6 text-foreground" />
				</div>

				<DialogTitle className="text-xl font-bold mb-1">Add action</DialogTitle>
				<DialogDescription className="text-sm text-muted-foreground mb-5">
					Create a new command to run from the toolbar.
				</DialogDescription>

				{/* Name */}
				<div className="space-y-2 mb-4">
					<Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Name
					</Label>
					<div className="flex items-center gap-2">
						<IconPicker value={icon} onChange={setIcon} />
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Dev Server"
							className="h-10 text-sm flex-1"
							onKeyDown={(e) => {
								if (e.key === "Enter") void handleSave();
							}}
							autoFocus
						/>
					</div>
				</div>

				{/* Command */}
				<div className="space-y-2 mb-6">
					<Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Command to run
					</Label>
					<textarea
						value={command}
						onChange={(e) => setCommand(e.target.value)}
						placeholder={"eg:\nnpm install\nnpm run"}
						rows={5}
						className="w-full rounded-lg border border-border bg-muted/30 p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
					/>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between gap-3">
					<button
						type="button"
						onClick={handleEnvironmentSettings}
						className="text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						Environment settings
					</button>
					<Button
						type="button"
						size="sm"
						disabled={!name.trim() || !command.trim() || isSaving}
						onClick={() => void handleSave()}
						className="px-5"
					>
						Save
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
