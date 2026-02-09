import { EXECUTION_MODES, type ExecutionMode } from "@superset/local-db";
import { Button } from "@superset/ui/button";
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
import { HiOutlineDocumentPlus, HiOutlineFolderPlus } from "react-icons/hi2";
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
	onToggleAutoApply: (presetId: string | null, field: AutoApplyField) => void;
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
			<div className="w-[7rem] flex justify-center gap-0.5 shrink-0 pt-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								onToggleAutoApply(
									isWorkspaceCreation ? null : preset.id,
									"applyOnWorkspaceCreated",
								)
							}
							className={`h-8 w-8 p-0 ${isWorkspaceCreation ? "text-blue-500 hover:text-blue-600" : "text-muted-foreground hover:text-foreground"}`}
							aria-label={
								isWorkspaceCreation
									? "Remove from workspace creation"
									: "Apply on workspace creation"
							}
						>
							<HiOutlineFolderPlus className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">
						{isWorkspaceCreation
							? "Applied on workspace creation (click to remove)"
							: "Apply on workspace creation"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								onToggleAutoApply(isNewTab ? null : preset.id, "applyOnNewTab")
							}
							className={`h-8 w-8 p-0 ${isNewTab ? "text-green-500 hover:text-green-600" : "text-muted-foreground hover:text-foreground"}`}
							aria-label={isNewTab ? "Remove from new tab" : "Apply on new tab"}
						>
							<HiOutlineDocumentPlus className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">
						{isNewTab
							? "Applied on new tab (click to remove)"
							: "Apply on new tab"}
					</TooltipContent>
				</Tooltip>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onDelete(rowIndex)}
					className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
					aria-label="Delete row"
				>
					<LuTrash className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
