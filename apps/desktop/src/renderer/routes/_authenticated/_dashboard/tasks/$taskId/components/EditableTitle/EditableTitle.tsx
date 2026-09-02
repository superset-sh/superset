import { useLingui } from "@lingui/react/macro";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface EditableTitleProps {
	value: string;
	onSave: (value: string) => void;
}

export function EditableTitle({ value, onSave }: EditableTitleProps) {
	const { t } = useLingui();
	const [localValue, setLocalValue] = useState(value);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Sync with external value changes
	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure height whenever the rendered text changes
	useLayoutEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		input.style.height = "auto";
		input.style.height = `${input.scrollHeight}px`;
	}, [localValue]);

	const handleBlur = () => {
		const trimmed = localValue.trim();
		if (trimmed && trimmed !== value) {
			onSave(trimmed);
		} else {
			setLocalValue(value);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.nativeEvent.isComposing) return;
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
		<textarea
			ref={inputRef}
			rows={1}
			value={localValue}
			onChange={(e) => setLocalValue(e.target.value)}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			className="mb-6 block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-2xl font-semibold leading-tight outline-none placeholder:text-muted-foreground focus:outline-none"
			placeholder={t({
				id: "dashboard.tasks.editableTitle.placeholder",
				message: "Task title...",
			})}
			aria-label={t({
				id: "dashboard.tasks.editableTitle.title",
				message: "Task title",
			})}
		/>
	);
}
