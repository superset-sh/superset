import { Badge } from "@superset/ui/badge";
import { useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { LuGripVertical } from "react-icons/lu";
import type { TerminalPreset } from "renderer/routes/_authenticated/settings/presets/types";

const PRESET_TYPE = "TERMINAL_PRESET";

interface PresetRowProps {
	preset: TerminalPreset;
	rowIndex: number;
	isEven: boolean;
	onEdit: (presetId: string) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetIndex: number) => void;
}

export function PresetRow({
	preset,
	rowIndex,
	isEven,
	onEdit,
	onLocalReorder,
	onPersistReorder,
}: PresetRowProps) {
	const rowRef = useRef<HTMLButtonElement>(null);
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

	const isWorkspaceCreation = !!(
		preset.applyOnWorkspaceCreated ||
		(!preset.applyOnNewTab && preset.isDefault)
	);
	const isNewTab = !!(
		preset.applyOnNewTab ||
		(!preset.applyOnWorkspaceCreated && preset.isDefault)
	);
	const modeValue =
		preset.executionMode === "new-tab" ? "new-tab" : "split-pane";
	const modeLabel =
		modeValue === "new-tab"
			? preset.commands.length > 1
				? "Tab per command"
				: "New tab"
			: preset.commands.length > 1
				? "Single tab + panes"
				: "Split pane";
	const commandsToShow = preset.commands.length > 0 ? preset.commands : [""];

	return (
		<button
			type="button"
			ref={rowRef}
			onClick={() => onEdit(preset.id)}
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
		</button>
	);
}
