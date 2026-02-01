import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuFile, LuFolder } from "react-icons/lu";
import type { NewItemMode } from "../../types";

interface NewItemInputProps {
	mode: NewItemMode;
	parentPath: string;
	onSubmit: (name: string) => void;
	onCancel: () => void;
	level?: number;
}

export function NewItemInput({
	mode,
	parentPath: _parentPath,
	onSubmit,
	onCancel,
	level = 0,
}: NewItemInputProps) {
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = () => {
		const trimmed = value.trim();
		if (trimmed) {
			onSubmit(trimmed);
		} else {
			onCancel();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		}
		if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	const Icon = mode === "folder" ? LuFolder : LuFile;

	return (
		<div
			className={cn("flex items-center gap-1 px-1 h-7", "bg-accent rounded-sm")}
			style={{ paddingLeft: `${level * 16 + 4}px` }}
		>
			<span className="w-4 h-4 shrink-0" />
			<Icon className="size-4 shrink-0 text-amber-500" />
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={handleSubmit}
				onKeyDown={handleKeyDown}
				placeholder={mode === "folder" ? "folder name" : "file name"}
				className={cn(
					"flex-1 min-w-0 px-1 py-0 text-xs",
					"bg-background border border-ring rounded outline-none",
				)}
			/>
		</div>
	);
}
