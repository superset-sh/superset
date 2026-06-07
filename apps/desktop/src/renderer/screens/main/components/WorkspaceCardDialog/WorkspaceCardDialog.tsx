import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type CustomCardLine,
	DEFAULT_WORKSPACE_CARD_CONFIG,
	type WorkspaceCardConfig,
} from "shared/workspace-card-config";

type BooleanCardField = {
	[K in keyof WorkspaceCardConfig]: WorkspaceCardConfig[K] extends boolean
		? K
		: never;
}[keyof WorkspaceCardConfig];

const FIELD_LABELS: Array<{ key: BooleanCardField; label: string }> = [
	{ key: "prTitle", label: "Pull request title" },
	{ key: "prChecks", label: "PR checks & review" },
	{ key: "diffStats", label: "Diff stats" },
	{ key: "status", label: "Agent status" },
	{ key: "linearTicket", label: "Linear ticket" },
];

interface WorkspaceCardDialogProps {
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Card customization dialog, opened from a workspace card's context menu.
 * Toggles the built-in lines and manages custom script lines: each command
 * runs in the workspace folder and its first output line shows on the card.
 */
export function WorkspaceCardDialog({
	projectId,
	open,
	onOpenChange,
}: WorkspaceCardDialogProps) {
	const utils = electronTrpc.useUtils();
	const { data: configData } =
		electronTrpc.config.getWorkspaceCardConfig.useQuery(
			{ projectId },
			{ enabled: open },
		);
	const config = configData ?? DEFAULT_WORKSPACE_CARD_CONFIG;

	const [newLabel, setNewLabel] = useState("");
	const [newCommand, setNewCommand] = useState("");

	const updateMutation =
		electronTrpc.config.updateWorkspaceCardConfig.useMutation({
			onError: (error) =>
				toast.error(`Failed to save card settings: ${error.message}`),
			onMutate: ({ workspaceCard }) => {
				// Optimistic update: write directly to the query cache so subsequent
				// rapid toggles read the latest value rather than a stale snapshot.
				utils.config.getWorkspaceCardConfig.setData(
					{ projectId },
					workspaceCard as WorkspaceCardConfig,
				);
			},
			onSettled: () =>
				utils.config.getWorkspaceCardConfig.invalidate({ projectId }),
		});

	// Always build saves from the latest cached value to avoid lost updates.
	const save = (next: WorkspaceCardConfig) => {
		updateMutation.mutate({ projectId, workspaceCard: next });
	};

	const handleAddLine = () => {
		const command = newCommand.trim();
		if (!command) return;
		const line: CustomCardLine = {
			id: `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			type: "command",
			label: newLabel.trim(),
			command,
			enabled: true,
		};
		save({ ...config, customLines: [...config.customLines, line] });
		setNewLabel("");
		setNewCommand("");
	};

	const patchLine = (
		id: string,
		patch: { enabled?: boolean; label?: string },
	) => {
		save({
			...config,
			customLines: config.customLines.map((line) =>
				line.id === id ? { ...line, ...patch } : line,
			),
		});
	};

	const removeLine = (id: string) => {
		save({
			...config,
			customLines: config.customLines.filter((line) => line.id !== id),
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Customize workspace cards</DialogTitle>
					<DialogDescription>
						Applies to every workspace card of this project.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					{FIELD_LABELS.map(({ key, label }) => (
						<div key={key} className="flex items-center justify-between gap-4">
							<span className="text-sm">{label}</span>
							<Switch
								checked={config[key]}
								onCheckedChange={(value) => save({ ...config, [key]: value })}
								disabled={updateMutation.isPending}
							/>
						</div>
					))}
				</div>

				<div className="space-y-2 border-t border-border pt-3">
					<div>
						<p className="text-sm font-medium">Custom lines</p>
						<p className="text-xs text-muted-foreground">
							A shell command run in the workspace folder; the first line of its
							output shows on the card. Same trust as setup scripts.
						</p>
					</div>

					{config.customLines.map((line) => (
						<div key={line.id} className="flex items-center gap-2">
							<Switch
								checked={line.enabled}
								onCheckedChange={(value) =>
									patchLine(line.id, { enabled: value })
								}
								disabled={updateMutation.isPending}
							/>
							<span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
								{line.label || "(no label)"}
							</span>
							{line.type === "component" ? (
								<span
									className="flex-1 truncate text-xs text-muted-foreground"
									title={line.component}
								>
									component: {line.component}
								</span>
							) : (
								<code className="flex-1 truncate text-xs" title={line.command}>
									{line.command}
								</code>
							)}
							<button
								type="button"
								onClick={() => removeLine(line.id)}
								className="text-muted-foreground hover:text-foreground"
								aria-label="Remove custom line"
							>
								<HiMiniXMark className="size-3.5" />
							</button>
						</div>
					))}

					<div className="flex items-center gap-2">
						<Input
							placeholder="Label"
							value={newLabel}
							onChange={(e) => setNewLabel(e.target.value)}
							className="w-24 shrink-0 h-7 text-xs"
						/>
						<Input
							placeholder="Command, e.g. git log -1 --format=%s"
							value={newCommand}
							onChange={(e) => setNewCommand(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleAddLine();
							}}
							className="flex-1 h-7 text-xs font-mono"
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={handleAddLine}
							disabled={!newCommand.trim() || updateMutation.isPending}
							className="h-7 gap-1 px-2"
						>
							<LuPlus className="size-3.5" />
							Add
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
