import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiOutlineStar, HiStar } from "react-icons/hi2";
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

interface PresetRowProps {
	preset: TerminalPreset;
	rowIndex: number;
	isEven: boolean;
	onChange: (rowIndex: number, column: PresetColumnKey, value: string) => void;
	onBlur: (rowIndex: number, column: PresetColumnKey) => void;
	onCommandsChange: (rowIndex: number, commands: string[]) => void;
	onCommandsBlur: (rowIndex: number) => void;
	onDelete: (rowIndex: number) => void;
	onSetDefault: (presetId: string | null) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
}

export function PresetRow({
	preset,
	rowIndex,
	isEven,
	onChange,
	onBlur,
	onCommandsChange,
	onCommandsBlur,
	onDelete,
	onSetDefault,
	onReorder,
}: PresetRowProps) {
	const rowRef = useRef<HTMLDivElement>(null);
	const dragHandleRef = useRef<HTMLDivElement>(null);

	const [{ isDragging }, drag, preview] = useDrag(
		() => ({
			type: PRESET_TYPE,
			item: { id: preset.id, index: rowIndex },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[preset.id, rowIndex],
	);

	const [{ isOver }, drop] = useDrop({
		accept: PRESET_TYPE,
		hover: (item: { id: string; index: number }) => {
			if (item.index !== rowIndex) {
				onReorder(item.index, rowIndex);
				item.index = rowIndex;
			}
		},
		collect: (monitor) => ({
			isOver: monitor.isOver(),
		}),
	});

	preview(drop(rowRef));
	drag(dragHandleRef);

	const handleToggleDefault = () => {
		// If already default, clear it; otherwise set this preset as default
		onSetDefault(preset.isDefault ? null : preset.id);
	};

	return (
		<div
			ref={rowRef}
			className={`flex items-start gap-4 py-3 px-4 ${
				isEven ? "bg-accent/20" : ""
			} ${isDragging ? "opacity-30" : ""} ${isOver ? "bg-accent/40" : ""}`}
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
			<div className="w-20 flex justify-center gap-1 shrink-0 pt-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleToggleDefault}
							className={`h-8 w-8 p-0 ${preset.isDefault ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground hover:text-foreground"}`}
							aria-label={
								preset.isDefault ? "Remove default" : "Set as default"
							}
						>
							{preset.isDefault ? (
								<HiStar className="h-4 w-4" />
							) : (
								<HiOutlineStar className="h-4 w-4" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">
						{preset.isDefault
							? "Remove as default"
							: "Set as default for new terminals"}
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
