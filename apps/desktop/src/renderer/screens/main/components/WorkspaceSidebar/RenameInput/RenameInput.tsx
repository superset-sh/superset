import { useEffect, useRef } from "react";

interface RenameInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
	className?: string;
}

export function RenameInput({
	value,
	onChange,
	onSubmit,
	onCancel,
	className,
}: RenameInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Delay to allow context menu to fully close
		const timer = setTimeout(() => {
			if (inputRef.current) {
				inputRef.current.focus();
				inputRef.current.select();
			}
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		e.stopPropagation();
		if (e.key === "Enter") {
			e.preventDefault();
			onSubmit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onBlur={onSubmit}
			onKeyDown={handleKeyDown}
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
			className={className}
		/>
	);
}
