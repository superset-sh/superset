import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import type { ChangesetFile } from "../../../../../useChangeset";

interface DiffHeaderPrefixProps {
	file: ChangesetFile;
	collapsed: boolean;
	onSetCollapsed: (value: boolean) => void;
}

export function DiffHeaderPrefix({
	file,
	collapsed,
	onSetCollapsed,
}: DiffHeaderPrefixProps) {
	const onToggle = useCallback(
		() => onSetCollapsed(!collapsed),
		[onSetCollapsed, collapsed],
	);

	return (
		// Flex wrapper: Tailwind preflight sets `img { display: block }`,
		// so without this the FileIcon drops below the chevron button.
		<div className="flex shrink-0 items-center gap-1">
			<button
				type="button"
				onClick={onToggle}
				aria-label={collapsed ? "Expand file" : "Collapse file"}
				className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
			>
				{collapsed ? (
					<ChevronRight className="size-3.5" />
				) : (
					<ChevronDown className="size-3.5" />
				)}
			</button>
			<FileIcon fileName={file.path} className="size-3.5 shrink-0" />
		</div>
	);
}
