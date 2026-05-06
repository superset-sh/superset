import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import type { FileMentionResult } from "../../types";

function getDirectory(relativePath: string): string {
	const lastSlash = relativePath.lastIndexOf("/");
	return lastSlash === -1 ? "" : relativePath.slice(0, lastSlash);
}

export interface FileMentionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const FileMentionList = forwardRef<
	FileMentionListRef,
	SuggestionProps<FileMentionResult>
>(({ items, command }, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new items
	useEffect(() => {
		setSelectedIndex(0);
	}, [items]);

	useEffect(() => {
		containerRef.current
			?.querySelector(`[data-index="${selectedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }: SuggestionKeyDownProps) => {
			if (items.length === 0) return false;
			if (event.key === "ArrowUp") {
				setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
				return true;
			}
			if (event.key === "ArrowDown") {
				setSelectedIndex((prev) => (prev + 1) % items.length);
				return true;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				const item = items[selectedIndex];
				if (item) command(item);
				return true;
			}
			return false;
		},
	}));

	if (items.length === 0) {
		return (
			<div className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md">
				<div className="px-2 py-1.5 text-xs text-muted-foreground">
					No files found
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md max-h-72 overflow-y-auto w-[28rem]"
		>
			{items.map((item, index) => {
				const directory = getDirectory(item.relativePath);
				return (
					<button
						type="button"
						key={item.id}
						data-index={index}
						onClick={() => command(item)}
						className={`relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-hidden select-none w-full ${
							index === selectedIndex ? "bg-accent text-accent-foreground" : ""
						}`}
					>
						<FileIcon
							fileName={item.name}
							isDirectory={item.isDirectory}
							className="size-3.5 shrink-0"
						/>
						<span className="max-w-[14rem] truncate">{item.name}</span>
						{directory && (
							<span className="min-w-0 truncate font-mono text-muted-foreground">
								{directory}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
});

FileMentionList.displayName = "FileMentionList";
