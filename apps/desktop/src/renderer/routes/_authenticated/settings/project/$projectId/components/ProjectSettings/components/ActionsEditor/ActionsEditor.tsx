import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiMiniPlus, HiMiniTrash } from "react-icons/hi2";
import { IconPicker } from "renderer/components/IconPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateProjectScriptQueries } from "renderer/lib/project-scripts";
import type { WorkspaceAction } from "shared/types/config";
import { v4 as uuidv4 } from "uuid";

interface ActionsEditorProps {
	projectId: string;
	className?: string;
}

function parseActionsFromConfig(content: string | null): WorkspaceAction[] {
	if (!content) return [];
	try {
		const parsed = JSON.parse(content);
		return Array.isArray(parsed.actions) ? parsed.actions : [];
	} catch {
		return [];
	}
}

interface ActionCardProps {
	action: WorkspaceAction;
	onUpdate: (id: string, patch: Partial<WorkspaceAction>) => void;
	onDelete: (id: string) => void;
}

function ActionCard({ action, onUpdate, onDelete }: ActionCardProps) {
	return (
		<div className="rounded-lg border border-border bg-background p-4 space-y-4">
			{/* Name row */}
			<div className="space-y-1.5">
				<Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Name
				</Label>
				<div className="flex items-center gap-2">
					<IconPicker
						value={action.icon}
						onChange={(key) => onUpdate(action.id, { icon: key })}
					/>
					<Input
						value={action.name}
						onChange={(e) => onUpdate(action.id, { name: e.target.value })}
						placeholder="Action name"
						className="h-10 text-sm"
					/>
				</div>
			</div>

			{/* Command row */}
			<div className="space-y-1.5">
				<Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Command
				</Label>
				<Input
					value={action.command}
					onChange={(e) => onUpdate(action.id, { command: e.target.value })}
					placeholder="e.g. bun run dev"
					className="h-10 text-sm font-mono"
				/>
			</div>

			{/* Footer with delete */}
			<div className="flex items-center justify-end pt-1">
				<button
					type="button"
					onClick={() => onDelete(action.id)}
					className="text-muted-foreground hover:text-destructive transition-colors"
					aria-label="Delete action"
				>
					<HiMiniTrash className="size-4" />
				</button>
			</div>
		</div>
	);
}

export function ActionsEditor({ projectId, className }: ActionsEditorProps) {
	const utils = electronTrpc.useUtils();

	const { data: configData } = electronTrpc.config.getConfigContent.useQuery(
		{ projectId },
		{ enabled: !!projectId },
	);

	const [actions, setActions] = useState<WorkspaceAction[]>([]);
	const debounceRef = useRef<NodeJS.Timeout | null>(null);
	const latestActionsRef = useRef<WorkspaceAction[]>([]);

	latestActionsRef.current = actions;

	const updateActionsMutation = electronTrpc.config.updateActions.useMutation();

	useEffect(() => {
		// Don't overwrite if there's a pending debounce
		if (debounceRef.current) return;
		setActions(parseActionsFromConfig(configData?.content ?? null));
	}, [configData?.content]);

	const persistActions = useCallback(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(async () => {
			debounceRef.current = null;
			try {
				await updateActionsMutation.mutateAsync({
					projectId,
					actions: latestActionsRef.current,
				});
				await invalidateProjectScriptQueries(utils, projectId);
			} catch (error) {
				console.error("[actions/save] Failed to save:", error);
			}
		}, 500);
	}, [projectId, updateActionsMutation, utils]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	const handleAddAction = useCallback(() => {
		const action: WorkspaceAction = {
			id: uuidv4(),
			name: "",
			command: "",
			icon: "run",
		};
		const updated = [...latestActionsRef.current, action];
		setActions(updated);
		persistActions();
	}, [persistActions]);

	const handleDeleteAction = useCallback(
		(id: string) => {
			const updated = latestActionsRef.current.filter((a) => a.id !== id);
			setActions(updated);
			persistActions();
		},
		[persistActions],
	);

	const handleUpdateAction = useCallback(
		(id: string, patch: Partial<WorkspaceAction>) => {
			const updated = latestActionsRef.current.map((a) =>
				a.id === id ? { ...a, ...patch } : a,
			);
			setActions(updated);
			persistActions();
		},
		[persistActions],
	);

	return (
		<div className={cn("space-y-4", className)} id="actions">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-base font-semibold text-foreground">Actions</h3>
					<p className="text-sm text-muted-foreground mt-0.5">
						These actions can run any command and will be displayed in the
						header.
					</p>
				</div>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={handleAddAction}
					className="shrink-0"
				>
					<HiMiniPlus className="size-4 mr-1" />
					Add action
				</Button>
			</div>

			{actions.length > 0 && (
				<div className="space-y-3">
					{actions.map((action) => (
						<ActionCard
							key={action.id}
							action={action}
							onUpdate={handleUpdateAction}
							onDelete={handleDeleteAction}
						/>
					))}
				</div>
			)}
		</div>
	);
}
