import { normalizeExecutionMode } from "@superset/local-db";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { LuGripVertical } from "react-icons/lu";
import type { TerminalPreset } from "renderer/routes/_authenticated/settings/presets/types";
import {
	getPresetProjectTargetLabel,
	type PresetProjectOption,
} from "../PresetsSection/preset-project-options";

const PRESET_TYPE = "TERMINAL_PRESET";

interface PresetRowProps {
	preset: TerminalPreset;
	rowIndex: number;
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>;
	onEdit: (presetId: string) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetIndex: number) => void;
	onToggleVisibility: (presetId: string, visible: boolean) => void;
}

export function PresetRow({
	preset,
	rowIndex,
	projectOptionsById,
	onEdit,
	onLocalReorder,
	onPersistReorder,
	onToggleVisibility,
}: PresetRowProps) {
	const rowRef = useRef<HTMLDivElement>(null);
	const dragHandleRef = useRef<HTMLButtonElement>(null);

	const [{ isDragging }, drag, preview] = useDrag(
		() => ({
			type: PRESET_TYPE,
			item: { id: preset.id, index: rowIndex, originalIndex: rowIndex },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[preset.id, rowIndex],
	);

	const [, drop] = useDrop({
		accept: PRESET_TYPE,
		hover: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.index !== rowIndex) {
				onLocalReorder(item.index, rowIndex);
				item.index = rowIndex;
			}
		},
		drop: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.originalIndex !== item.index) {
				onPersistReorder(item.id, item.index);
			}
		},
	});

	useEffect(() => {
		preview(drop(rowRef));
		drag(dragHandleRef);
	}, [preview, drop, drag]);

	const isWorkspaceCreation = !!preset.applyOnWorkspaceCreated;
	const isNewTab = !!preset.applyOnNewTab;
	const isVisibleInBar = preset.pinnedToBar !== false;
	const modeValue = normalizeExecutionMode(preset.executionMode);
	const modeLabel =
		modeValue === "new-tab"
			? preset.commands.length > 1
				? "Tab per command"
				: "New tab"
			: modeValue === "new-tab-split-pane"
				? preset.commands.length > 1
					? "New tab + panes"
					: "New tab"
				: preset.commands.length > 1
					? "Single tab + panes"
					: "Split pane";
	const firstCommand =
		preset.commands.find((cmd) => cmd.trim().length > 0)?.trim() ??
		"Empty command";
	const commandSummary =
		preset.commands.length > 1
			? `${firstCommand}  +${preset.commands.length - 1}`
			: firstCommand;
	const appliesToLabel = getPresetProjectTargetLabel(
		preset.projectIds,
		projectOptionsById,
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: div needed to avoid invalid nested <button> elements
		<div
			role="button"
			tabIndex={0}
			ref={rowRef}
			onClick={() => onEdit(preset.id)}
			onKeyDown={(e) => {
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onEdit(preset.id);
				}
			}}
			className={cn(
				"group flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				isDragging && "opacity-30",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium truncate">
						{preset.name.trim() || "Untitled preset"}
					</span>
					{isWorkspaceCreation && (
						<Badge
							variant="secondary"
							className="text-[10px] h-4 px-1.5 shrink-0"
						>
							Workspace
						</Badge>
					)}
					{isNewTab && (
						<Badge
							variant="secondary"
							className="text-[10px] h-4 px-1.5 shrink-0"
						>
							Tab
						</Badge>
					)}
				</div>
				<div className="text-xs font-mono text-muted-foreground truncate">
					{commandSummary}
				</div>
			</div>

			<div className="shrink-0 hidden md:block text-xs text-muted-foreground truncate max-w-[18rem]">
				{appliesToLabel} · {modeLabel}
			</div>

			<button
				type="button"
				className={cn(
					"shrink-0 p-1.5 rounded transition-colors",
					isVisibleInBar
						? "text-muted-foreground/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground"
						: "text-muted-foreground/40 hover:bg-accent hover:text-foreground",
				)}
				onClick={(e) => {
					e.stopPropagation();
					onToggleVisibility(preset.id, !isVisibleInBar);
				}}
				title={isVisibleInBar ? "Hide from bar" : "Show in bar"}
				aria-label={isVisibleInBar ? "Hide from bar" : "Show in bar"}
				aria-pressed={isVisibleInBar}
			>
				{isVisibleInBar ? (
					<Eye className="size-4" />
				) : (
					<EyeOff className="size-4" />
				)}
			</button>

			<button
				type="button"
				ref={dragHandleRef}
				onClick={(e) => e.stopPropagation()}
				className={cn(
					"shrink-0 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-accent rounded p-1 -m-1 cursor-grab active:cursor-grabbing bg-transparent border-0 transition-opacity",
					"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
					isDragging && "opacity-100",
				)}
				aria-label="Drag to reorder"
			>
				<LuGripVertical className="size-4" />
			</button>
		</div>
	);
}
