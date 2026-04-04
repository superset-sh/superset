import { useEffect, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import {
	ROW_HEIGHT,
	TREE_INDENT,
} from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/constants";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

interface NewItemInputProps {
	mode: "file" | "folder";
	depth: number;
	initialValue?: string;
	onSubmit: (name: string) => void;
	onCancel: () => void;
}

export function NewItemInput({
	mode,
	depth,
	initialValue = "",
	onSubmit,
	onCancel,
}: NewItemInputProps) {
	const [value, setValue] = useState(initialValue);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		// For rename: select the name up to the extension so user can type to replace
		if (initialValue) {
			const dotIndex = initialValue.lastIndexOf(".");
			if (dotIndex > 0 && mode === "file") {
				input.setSelectionRange(0, dotIndex);
			} else {
				input.select();
			}
		}
	}, [initialValue, mode]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const trimmed = value.trim();
			if (trimmed && trimmed !== initialValue) onSubmit(trimmed);
			else onCancel();
		} else if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	const displayName = value.includes("/")
		? (value.split("/").pop() ?? "")
		: value;

	return (
		<div
			data-new-item-input
			className="flex w-full items-center gap-1 px-1"
			style={{
				height: ROW_HEIGHT,
				paddingLeft: 4 + depth * TREE_INDENT,
			}}
		>
			<span className="flex h-4 w-4 shrink-0 items-center justify-center">
				{mode === "folder" ? (
					<LuChevronDown className="size-3.5 text-muted-foreground" />
				) : null}
			</span>

			<FileIcon
				className="size-4 shrink-0"
				fileName={displayName || (mode === "folder" ? "folder" : "file")}
				isDirectory={mode === "folder"}
				isOpen={false}
			/>

			<input
				ref={inputRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={onCancel}
				className="min-w-0 flex-1 bg-transparent text-xs outline-none ring-1 ring-ring rounded-sm px-1"
				style={{ height: ROW_HEIGHT - 4 }}
			/>
		</div>
	);
}
