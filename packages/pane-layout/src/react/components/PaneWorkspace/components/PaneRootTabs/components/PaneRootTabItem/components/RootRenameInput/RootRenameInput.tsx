import { useEffect, useRef } from "react";

interface RootRenameInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
	className?: string;
	maxLength?: number;
}

export function RootRenameInput({
	value,
	onChange,
	onSubmit,
	onCancel,
	className,
	maxLength,
}: RootRenameInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, []);

	return (
		<input
			ref={inputRef}
			className={className}
			maxLength={maxLength}
			onBlur={onSubmit}
			onChange={(event) => onChange(event.target.value)}
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Enter") {
					event.preventDefault();
					onSubmit();
				} else if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				}
			}}
			onMouseDown={(event) => event.stopPropagation()}
			type="text"
			value={value}
		/>
	);
}
