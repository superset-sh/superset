import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuX } from "react-icons/lu";
import type { DirectoryEntry } from "shared/file-tree-types";
import { getFileIcon } from "../../utils";

interface RenameInputProps {
	entry: DirectoryEntry;
	onSubmit: (newName: string) => void;
	onCancel: () => void;
	level?: number;
}

export function RenameInput({
	entry,
	onSubmit,
	onCancel,
	level = 0,
}: RenameInputProps) {
	const [value, setValue] = useState(entry.name);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (inputRef.current) {
				inputRef.current.focus();
				const lastDot = entry.name.lastIndexOf(".");
				if (!entry.isDirectory && lastDot > 0) {
					inputRef.current.setSelectionRange(0, lastDot);
				} else {
					inputRef.current.select();
				}
			}
		}, 50);
		return () => clearTimeout(timer);
	}, [entry.name, entry.isDirectory]);

	const handleSubmit = () => {
		const trimmed = value.trim();
		if (trimmed && trimmed !== entry.name) {
			onSubmit(trimmed);
		} else {
			onCancel();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		e.stopPropagation();
		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		}
		if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	const { icon: Icon, color } = getFileIcon(
		entry.name,
		entry.isDirectory,
		false,
	);

	return (
		<div
			className={cn("flex items-center gap-1 px-1 h-7", "bg-accent rounded-sm")}
			style={{ paddingLeft: `${level * 16 + 4}px` }}
		>
			<span className="w-4 h-4 shrink-0" />
			<Icon className={cn("size-4 shrink-0", color)} />
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleSubmit}
				className={cn(
					"flex-1 min-w-0 px-1 py-0 text-xs",
					"bg-background border border-ring rounded outline-none",
				)}
			/>
			<button
				type="button"
				onClick={handleSubmit}
				className="p-0.5 hover:bg-background/50 rounded"
			>
				<LuCheck className="size-3 text-muted-foreground" />
			</button>
			<button
				type="button"
				onMouseDown={(e) => {
					e.preventDefault();
					onCancel();
				}}
				className="p-0.5 hover:bg-background/50 rounded"
			>
				<LuX className="size-3 text-muted-foreground" />
			</button>
		</div>
	);
}
