import { useEffect, useRef, useState } from "react";

interface EditableTitleProps {
	value: string;
	onSave: (value: string) => void;
}

export function EditableTitle({ value, onSave }: EditableTitleProps) {
	const [localValue, setLocalValue] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);

	// Sync with external value changes
	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	const handleBlur = () => {
		const trimmed = localValue.trim();
		if (trimmed && trimmed !== value) {
			onSave(trimmed);
		} else {
			setLocalValue(value);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			inputRef.current?.blur();
		}
		if (e.key === "Escape") {
			setLocalValue(value);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			value={localValue}
			onChange={(e) => setLocalValue(e.target.value)}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			className="w-full text-2xl font-semibold mb-6 p-0 bg-transparent border-none outline-none focus:outline-none placeholder:text-muted-foreground"
			placeholder="Task title..."
		/>
	);
}
