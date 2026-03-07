import { useEffect, useRef, useState } from "react";

interface EditableTitleProps {
	value: string;
	onSave: (value: string) => void;
	onValueChange?: (value: string) => void;
}

export function EditableTitle({
	value,
	onSave,
	onValueChange,
}: EditableTitleProps) {
	const [localValue, setLocalValue] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);

	// Sync with external value changes
	useEffect(() => {
		setLocalValue(value);
		onValueChange?.(value);
	}, [onValueChange, value]);

	const handleBlur = () => {
		const trimmed = localValue.trim();
		if (trimmed && trimmed !== value) {
			setLocalValue(trimmed);
			onValueChange?.(trimmed);
			onSave(trimmed);
		} else {
			setLocalValue(value);
			onValueChange?.(value);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			inputRef.current?.blur();
		}
		if (e.key === "Escape") {
			setLocalValue(value);
			onValueChange?.(value);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			value={localValue}
			onChange={(e) => {
				const nextValue = e.target.value;
				setLocalValue(nextValue);
				onValueChange?.(nextValue);
			}}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			className="w-full text-2xl font-semibold mb-6 p-0 bg-transparent border-none outline-none focus:outline-none placeholder:text-muted-foreground"
			placeholder="Task title..."
		/>
	);
}
