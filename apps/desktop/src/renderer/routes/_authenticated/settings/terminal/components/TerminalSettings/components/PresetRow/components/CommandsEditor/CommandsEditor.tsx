import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { HiMiniPlus, HiMiniXMark } from "react-icons/hi2";

interface CommandsEditorProps {
	commands: string[];
	onChange: (commands: string[]) => void;
	onBlur?: () => void;
	placeholder?: string;
}

export function CommandsEditor({
	commands,
	onChange,
	onBlur,
	placeholder = "Command...",
}: CommandsEditorProps) {
	const baseId = useId();
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const [focusIndex, setFocusIndex] = useState<number | null>(null);

	useEffect(() => {
		if (focusIndex !== null && inputRefs.current[focusIndex]) {
			inputRefs.current[focusIndex]?.focus();
			setFocusIndex(null);
		}
	}, [focusIndex]);

	const setInputRef = useCallback(
		(index: number) => (el: HTMLInputElement | null) => {
			inputRefs.current[index] = el;
		},
		[],
	);

	const handleCommandChange = (index: number, value: string) => {
		const updated = [...commands];
		updated[index] = value;
		onChange(updated);
	};

	const handleAddCommand = () => {
		onChange([...commands, ""]);
		setFocusIndex(commands.length);
	};

	const handleDeleteCommand = (index: number) => {
		if (commands.length > 1) {
			const updated = commands.filter((_, i) => i !== index);
			onChange(updated);
			setFocusIndex(Math.max(0, index - 1));
		}
	};

	return (
		<div className="flex flex-col gap-1.5 min-w-0">
			{commands.map((command, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: commands are ordered strings without stable IDs
				<div key={`${baseId}-${index}`} className="flex items-center gap-2">
					<Input
						ref={setInputRef(index)}
						value={command}
						onChange={(e) => handleCommandChange(index, e.target.value)}
						onBlur={onBlur}
						className="h-8 px-2 text-sm flex-1 min-w-0"
						placeholder={placeholder}
					/>
					{commands.length > 1 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleDeleteCommand(index)}
							className="h-8 px-2 text-xs hover:bg-destructive/10 hover:text-destructive shrink-0"
							aria-label="Delete command"
						>
							<HiMiniXMark className="h-3.5 w-3.5" />
							Delete
						</Button>
					)}
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="xs"
				onClick={handleAddCommand}
				className="w-fit mt-1"
			>
				<HiMiniPlus className="h-3.5 w-3.5" />
				Add command
			</Button>
		</div>
	);
}
