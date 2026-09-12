import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { useHotkey } from "renderer/hotkeys";

interface WorkItemsSearchProps {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	label: string;
	className?: string;
	/** Extends the positioning wrapper (the icon anchors to it), not the input. */
	containerClassName?: string;
}

export function WorkItemsSearch({
	value,
	onChange,
	placeholder,
	label,
	className,
	containerClassName,
}: WorkItemsSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useHotkey(
		"FOCUS_TASK_SEARCH",
		() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		},
		{ preventDefault: true },
	);

	return (
		<div
			className={cn("relative w-full @4xl:w-56 @6xl:w-64", containerClassName)}
		>
			<HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				ref={inputRef}
				type="text"
				aria-label={label}
				placeholder={placeholder}
				autoComplete="off"
				spellCheck={false}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						onChange("");
						inputRef.current?.blur();
					}
				}}
				className={cn(
					"h-8 border-0 bg-muted/50 pl-9 pr-3 text-sm focus-visible:ring-1",
					className,
				)}
			/>
		</div>
	);
}
