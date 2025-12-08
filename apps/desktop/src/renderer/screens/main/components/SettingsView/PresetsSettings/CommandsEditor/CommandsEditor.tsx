import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useId } from "react";
import { HiMiniXMark } from "react-icons/hi2";

interface CommandsEditorProps {
	commands: string[];
	onChange: (commands: string[]) => void;
	placeholder?: string;
}

export function CommandsEditor({
	commands,
	onChange,
	placeholder = "Command...",
}: CommandsEditorProps) {
	const baseId = useId();
	const handleCommandChange = (index: number, value: string) => {
		const updated = [...commands];
		updated[index] = value;
		onChange(updated);
	};

	const handleCommandKeyDown = (
		e: React.KeyboardEvent<HTMLInputElement>,
		index: number,
	) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const updated = [...commands];
			updated.splice(index + 1, 0, "");
			onChange(updated);
			setTimeout(() => {
				const inputs = document.querySelectorAll<HTMLInputElement>(
					`[data-command-input="${index + 1}"]`,
				);
				inputs[0]?.focus();
			}, 0);
		} else if (
			e.key === "Backspace" &&
			commands[index] === "" &&
			commands.length > 1
		) {
			e.preventDefault();
			const updated = commands.filter((_, i) => i !== index);
			onChange(updated);
		}
	};

	const handleDeleteCommand = (index: number) => {
		if (commands.length > 1) {
			const updated = commands.filter((_, i) => i !== index);
			onChange(updated);
		}
	};

	return (
		<div className="flex flex-col gap-1.5 min-w-0">
			{commands.map((command, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: commands are ordered strings without stable IDs
				<div key={`${baseId}-${index}`} className="flex items-center gap-2">
					<Input
						variant="ghost"
						value={command}
						onChange={(e) => handleCommandChange(index, e.target.value)}
						onKeyDown={(e) => handleCommandKeyDown(e, index)}
						data-command-input={index}
						className="h-7 px-2 text-sm font-mono flex-1"
						placeholder={placeholder}
					/>
					{commands.length > 1 && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleDeleteCommand(index)}
							className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive shrink-0"
							aria-label="Delete command"
						>
							<HiMiniXMark className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			))}
		</div>
	);
}
