import { cn } from "@superset/ui/utils";
import type { NodeRendererProps } from "react-arborist";
import { useRef } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { FileTreeNode as FileTreeNodeType } from "shared/file-tree-types";
import { usePathActions } from "../../../ChangesView/hooks";
import { getFileIcon } from "../../utils";

type FileTreeNodeProps = NodeRendererProps<FileTreeNodeType> & {
	worktreePath: string;
	onCancelOpen: () => void;
};

export function FileTreeNode({
	node,
	style,
	dragHandle,
	worktreePath,
	onCancelOpen,
}: FileTreeNodeProps) {
	const { data } = node;
	const { icon: Icon, color } = getFileIcon(
		data.name,
		data.isDirectory,
		node.isOpen,
	);
	const { openInEditor } = usePathActions({
		absolutePath: data.path ?? null,
		relativePath: data.relativePath,
		cwd: worktreePath,
	});

	const handleClick = (e: React.MouseEvent) => {
		console.log("[FileTreeNode] handleClick", {
			name: data.name,
			detail: e.detail,
			isDirectory: data.isDirectory,
		});
		// Ignore second click of double-click sequence
		if (e.detail > 1) return;

		if (data.isDirectory) {
			node.toggle();
		} else {
			node.activate();
		}
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		console.log("[FileTreeNode] handleDoubleClick", {
			name: data.name,
			isDirectory: data.isDirectory,
			absolutePath: data.path,
		});
		if (data.isDirectory) {
			return;
		}

		e.stopPropagation();
		e.preventDefault();

		console.log("[FileTreeNode] Calling onCancelOpen and openInEditor");
		onCancelOpen();
		openInEditor();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			if (data.isDirectory) {
				node.toggle();
			} else {
				node.activate();
			}
		}
	};

	return (
		<div
			ref={dragHandle}
			style={style}
			role="treeitem"
			tabIndex={0}
			aria-expanded={data.isDirectory ? node.isOpen : undefined}
			aria-selected={node.isSelected}
			className={cn(
				"flex items-center gap-1 px-1 h-full cursor-pointer select-none",
				"hover:bg-accent/50 transition-colors",
				node.isSelected && "bg-accent",
				node.isFocused && !node.isSelected && "ring-1 ring-ring ring-inset",
			)}
			onClick={handleClick}
			onDoubleClickCapture={(e) => {
				console.log("[FileTreeNode] onDoubleClickCapture fired", data.name);
			}}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
		>
			<span className="flex items-center justify-center w-4 h-4 shrink-0">
				{data.isDirectory ? (
					node.isOpen ? (
						<LuChevronDown className="size-3.5 text-muted-foreground" />
					) : (
						<LuChevronRight className="size-3.5 text-muted-foreground" />
					)
				) : null}
			</span>

			<Icon className={cn("size-4 shrink-0", color)} />

			{node.isEditing ? (
				<input
					type="text"
					defaultValue={data.name}
					onFocus={(e) => {
						if (!data.isDirectory) {
							const dotIndex = data.name.lastIndexOf(".");
							if (dotIndex > 0) {
								e.target.setSelectionRange(0, dotIndex);
								return;
							}
						}
						e.target.select();
					}}
					onBlur={() => node.reset()}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							const newName = e.currentTarget.value.trim();
							if (newName && newName !== data.name) {
								node.submit(newName);
							} else {
								node.reset();
							}
						}
						if (e.key === "Escape") {
							node.reset();
						}
					}}
					className={cn(
						"flex-1 min-w-0 px-1 py-0 text-xs bg-background border border-ring rounded outline-none",
					)}
				/>
			) : (
				<span
					className={cn(
						"flex-1 min-w-0 text-xs truncate",
						data.isLoading && "opacity-50",
					)}
				>
					{data.name}
				</span>
			)}
		</div>
	);
}
