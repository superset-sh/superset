import { normalizeExecutionMode } from "@superset/local-db";
import { Badge } from "@superset/ui/badge";
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
	isEven: boolean;
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>;
	onEdit: (presetId: string) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetIndex: number) => void;
	onToggleVisibility: (presetId: string, visible: boolean) => void;
}

export function PresetRow({
	preset,
	rowIndex,
	isEven,
	projectOptionsById,
	onEdit,
	onLocalReorder,
	onPersistReorder,
	onToggleVisibility,
}: PresetRowProps) {
	const rowRef = useRef<HTMLDivElement>(null);
	const dragHandleRef = useRef<HTMLDivElement>(null);

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
	const commandsToShow = preset.commands.length > 0 ? preset.commands : [""];
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
			className={`w-full flex items-start gap-4 py-3 px-4 text-left cursor-pointer hover:bg-accent/30 transition-colors ${
				isEven ? "bg-accent/20" : ""
			} ${isDragging ? "opacity-30" : ""}`}
		>
			<div
				ref={dragHandleRef}
				className="w-6 flex justify-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
			>
				<LuGripVertical className="h-4 w-4" />
			</div>

			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium truncate">
					{preset.name.trim() || "Untitled preset"}
				</div>
				{preset.description?.trim() ? (
					<div className="text-xs text-muted-foreground truncate">
						{preset.description}
					</div>
				) : null}
			</div>

			<div className="flex-[1.2] min-w-0 space-y-1">
				{commandsToShow.map((command, index) => (
					<div
						key={`${preset.id}-command-${index}`}
						className="text-xs font-mono text-muted-foreground truncate"
					>
						{command.trim() || "Empty command"}
					</div>
				))}
			</div>

			<div className="w-40 shrink-0 pt-0.5">
				<Badge variant="outline" className="max-w-full truncate">
					{appliesToLabel}
				</Badge>
			</div>

			<div className="w-32 shrink-0 pt-0.5">
				<span className="text-xs text-muted-foreground">{modeLabel}</span>
			</div>

			<div className="w-36 shrink-0 flex items-center justify-start gap-1.5 pt-0.5">
				{isWorkspaceCreation ? (
					<Badge variant="secondary" className="text-[10px]">
						Workspace
					</Badge>
				) : null}
				{isNewTab ? (
					<Badge variant="secondary" className="text-[10px]">
						Tab
					</Badge>
				) : null}
			</div>

			<div className="w-16 shrink-0 flex items-center justify-center">
				<button
					type="button"
					className="p-1 rounded hover:bg-accent/50 transition-colors"
					onClick={(e) => {
						e.stopPropagation();
						onToggleVisibility(preset.id, !isVisibleInBar);
					}}
					title={isVisibleInBar ? "Hide from bar" : "Show in bar"}
					aria-label={isVisibleInBar ? "Hide from bar" : "Show in bar"}
					aria-pressed={isVisibleInBar}
				>
					{isVisibleInBar ? (
						<Eye className="size-3.5 text-foreground" />
					) : (
						<EyeOff className="size-3.5 text-muted-foreground/40" />
					)}
				</button>
			</div>
		</div>
	);
}
