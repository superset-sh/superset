import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useRef, useState } from "react";
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
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const commandIdsRef = useRef(
		commands.map(() => Math.random().toString(36).slice(2)),
	);
	const [focusIndex, setFocusIndex] = useState<number | null>(null);

	useEffect(() => {
		if (focusIndex !== null && inputRefs.current[focusIndex]) {
			inputRefs.current[focusIndex]?.focus();
			setFocusIndex(null);
		}
	}, [focusIndex]);

	useEffect(() => {
		const ids = commandIdsRef.current;
		if (commands.length > ids.length) {
			ids.push(
				...Array.from({ length: commands.length - ids.length }, () =>
					Math.random().toString(36).slice(2),
				),
			);
			return;
		}

		if (commands.length < ids.length) {
			ids.splice(commands.length);
		}
	}, [commands.length]);

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
		commandIdsRef.current.push(Math.random().toString(36).slice(2));
		onChange([...commands, ""]);
		setFocusIndex(commands.length);
	};

	const handleDeleteCommand = (index: number) => {
		if (commands.length > 1) {
			commandIdsRef.current = commandIdsRef.current.filter(
				(_, i) => i !== index,
			);
			const updated = commands.filter((_, i) => i !== index);
			onChange(updated);
			setFocusIndex(Math.max(0, index - 1));
		}
	};

	const inputClassName =
		"h-8 flex-1 min-w-0 border-border/70 bg-transparent px-2 text-sm shadow-none dark:bg-transparent focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10";

	return (
		<div className="flex flex-col gap-1.5 min-w-0">
			{commands.map((command, index) => (
				<div
					key={commandIdsRef.current[index]}
					className="group/command-row flex items-center gap-2"
				>
					<Input
						ref={setInputRef(index)}
						value={command}
						onChange={(e) => handleCommandChange(index, e.target.value)}
						onBlur={onBlur}
						className={inputClassName}
						placeholder={placeholder}
					/>
					{commands.length > 1 && (
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => handleDeleteCommand(index)}
							className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/command-row:opacity-100 group-focus-within/command-row:opacity-100"
							aria-label={`Delete command ${index + 1}`}
						>
							<HiMiniXMark className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			))}
			<button
				type="button"
				onClick={handleAddCommand}
				className="mt-1 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
			>
				<HiMiniPlus className="h-3.5 w-3.5" />
				Add command
			</button>
		</div>
	);
}
