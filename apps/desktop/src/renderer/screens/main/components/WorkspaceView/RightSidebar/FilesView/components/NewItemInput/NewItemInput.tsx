import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuChevronRight, LuFile, LuFolder, LuX } from "react-icons/lu";
import { ROW_HEIGHT, TREE_INDENT } from "../../constants";
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
		const timer = setTimeout(() => {
			if (inputRef.current) {
				inputRef.current.focus();
				inputRef.current.select();
			}
		}, 50);
		return () => clearTimeout(timer);
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

	const isFolder = mode === "folder";
	const Icon = isFolder ? LuFolder : LuFile;

	return (
		<div
			style={{
				height: ROW_HEIGHT,
				paddingLeft: level * TREE_INDENT,
			}}
			className={cn("flex items-center gap-1 px-1", "bg-accent")}
		>
			{isFolder ? (
				<span className="flex items-center justify-center w-4 h-4 shrink-0">
					<LuChevronRight className="size-3.5 text-muted-foreground" />
				</span>
			) : null}
			<Icon
				className={cn("size-4 shrink-0 text-amber-500", !isFolder && "ml-2")}
			/>
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={isFolder ? "folder name" : "file name"}
				className={cn(
					"flex-1 min-w-0 px-1 py-0 text-xs h-5",
					"bg-background border border-ring rounded outline-none",
				)}
			/>
			<button
				type="button"
				onClick={onCancel}
				className="p-0.5 hover:bg-background/50 rounded shrink-0"
			>
				<LuX className="size-3 text-muted-foreground" />
			</button>
		</div>
	);
}
