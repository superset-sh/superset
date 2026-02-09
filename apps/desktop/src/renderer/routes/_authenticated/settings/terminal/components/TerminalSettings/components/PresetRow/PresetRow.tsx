import { EXECUTION_MODES, type ExecutionMode } from "@superset/local-db";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { LuGripVertical, LuTrash } from "react-icons/lu";
import {
	PRESET_COLUMNS,
	type PresetColumnConfig,
	type PresetColumnKey,
	type TerminalPreset,
} from "renderer/routes/_authenticated/settings/presets/types";
import { CommandsEditor } from "./components/CommandsEditor";

const PRESET_TYPE = "TERMINAL_PRESET";

interface PresetCellProps {
	column: PresetColumnConfig;
	preset: TerminalPreset;
	rowIndex: number;
	onChange: (rowIndex: number, column: PresetColumnKey, value: string) => void;
	onBlur: (rowIndex: number, column: PresetColumnKey) => void;
	onCommandsChange: (rowIndex: number, commands: string[]) => void;
	onCommandsBlur: (rowIndex: number) => void;
}

function PresetCell({
	column,
	preset,
	rowIndex,
	onChange,
	onBlur,
	onCommandsChange,
	onCommandsBlur,
}: PresetCellProps) {
	const value = preset[column.key];

	if (column.key === "commands") {
		return (
			<CommandsEditor
				commands={value as string[]}
				onChange={(commands) => onCommandsChange(rowIndex, commands)}
				onBlur={() => onCommandsBlur(rowIndex)}
				placeholder={column.placeholder}
			/>
		);
	}

	return (
		<Input
			variant="ghost"
			value={(value as string) ?? ""}
			onChange={(e) => onChange(rowIndex, column.key, e.target.value)}
			onBlur={() => onBlur(rowIndex, column.key)}
			className={`h-8 px-2 text-sm w-full min-w-0 truncate ${column.mono ? "font-mono" : ""}`}
			placeholder={column.placeholder}
		/>
	);
}

type AutoApplyField = "applyOnWorkspaceCreated" | "applyOnNewTab";

interface PresetRowProps {
	preset: TerminalPreset;
	rowIndex: number;
	isEven: boolean;
	onChange: (rowIndex: number, column: PresetColumnKey, value: string) => void;
	onBlur: (rowIndex: number, column: PresetColumnKey) => void;
	onCommandsChange: (rowIndex: number, commands: string[]) => void;
	onCommandsBlur: (rowIndex: number) => void;
	onExecutionModeChange: (rowIndex: number, mode: ExecutionMode) => void;
	onDelete: (rowIndex: number) => void;
	onToggleAutoApply: (
		presetId: string,
		field: AutoApplyField,
		enabled: boolean,
	) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetIndex: number) => void;
}

export function PresetRow({
	preset,
	rowIndex,
	isEven,
	onChange,
	onBlur,
	onCommandsChange,
	onCommandsBlur,
	onExecutionModeChange,
	onDelete,
	onToggleAutoApply,
	onLocalReorder,
	onPersistReorder,
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

	const isWorkspaceCreation =
		preset.applyOnWorkspaceCreated ||
		(!preset.applyOnNewTab && preset.isDefault);
	const isNewTab =
		preset.applyOnNewTab ||
		(!preset.applyOnWorkspaceCreated && preset.isDefault);

	return (
		<div
			ref={rowRef}
			className={`flex items-start gap-4 py-3 px-4 ${
				isEven ? "bg-accent/20" : ""
			} ${isDragging ? "opacity-30" : ""}`}
		>
			<div
				ref={dragHandleRef}
				className="w-6 flex justify-center shrink-0 pt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
			>
				<LuGripVertical className="h-4 w-4" />
			</div>
			{PRESET_COLUMNS.map((column) => (
				<div key={column.key} className="flex-1 min-w-0">
					<PresetCell
						column={column}
						preset={preset}
						rowIndex={rowIndex}
						onChange={onChange}
						onBlur={onBlur}
						onCommandsChange={onCommandsChange}
						onCommandsBlur={onCommandsBlur}
					/>
				</div>
			))}
			<div className="w-28 shrink-0 pt-0.5">
				<Select
					value={preset.executionMode ?? "sequential"}
					onValueChange={(value) => {
						if (EXECUTION_MODES.includes(value as ExecutionMode)) {
							onExecutionModeChange(rowIndex, value as ExecutionMode);
						}
					}}
				>
					<SelectTrigger className="h-8 w-full text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="sequential">Sequential</SelectItem>
						<SelectItem value="parallel">Parallel</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="w-[7rem] flex items-center justify-center gap-1 shrink-0 pt-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() =>
								onToggleAutoApply(
									preset.id,
									"applyOnWorkspaceCreated",
									!isWorkspaceCreation,
								)
							}
							className={`text-[10px] leading-none font-medium px-1.5 py-1 rounded-md border cursor-pointer transition-colors ${
								isWorkspaceCreation
									? "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400"
									: "text-muted-foreground/50 border-transparent hover:border-border hover:text-muted-foreground"
							}`}
						>
							WS
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">
						{isWorkspaceCreation
							? "Runs on workspace creation (click to remove)"
							: "Run on workspace creation"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() =>
								onToggleAutoApply(preset.id, "applyOnNewTab", !isNewTab)
							}
							className={`text-[10px] leading-none font-medium px-1.5 py-1 rounded-md border cursor-pointer transition-colors ${
								isNewTab
									? "bg-green-500/15 text-green-600 border-green-500/30 dark:text-green-400"
									: "text-muted-foreground/50 border-transparent hover:border-border hover:text-muted-foreground"
							}`}
						>
							Tab
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">
						{isNewTab ? "Runs on new tab (click to remove)" : "Run on new tab"}
					</TooltipContent>
				</Tooltip>
				<button
					type="button"
					onClick={() => onDelete(rowIndex)}
					className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
					aria-label="Delete row"
				>
					<LuTrash className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}
