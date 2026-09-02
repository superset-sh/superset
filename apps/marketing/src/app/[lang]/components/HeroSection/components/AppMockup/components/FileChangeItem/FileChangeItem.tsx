"use client";

import {
	VscChevronDown,
	VscDiffAdded,
	VscDiffModified,
	VscDiffRemoved,
} from "react-icons/vsc";
import type { FileChangeType } from "../../types";

interface FileChangeItemProps {
	path: string;
	add?: number;
	del?: number;
	indent?: number;
	type: FileChangeType;
}

export function FileChangeItem({
	path,
	add = 0,
	del = 0,
	indent = 0,
	type,
}: FileChangeItemProps) {
	const isFolder = type === "folder";

	if (isFolder) {
		return (
			<div
				className="flex items-center gap-1.5 px-3 pb-2 pt-5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/65"
				style={{ paddingLeft: `${10 + indent * 12}px` }}
			>
				<VscChevronDown className="size-2.5 text-muted-foreground/45" />
				<span className="truncate">{path}</span>
			</div>
		);
	}

	const Icon =
		type === "add"
			? VscDiffAdded
			: type === "delete"
				? VscDiffRemoved
				: VscDiffModified;

	const iconColor = "text-muted-foreground/55";

	return (
		<div
			className="flex h-7 items-center justify-between gap-2 hover:bg-foreground/[0.025]"
			style={{ paddingLeft: `${14 + indent * 12}px`, paddingRight: "12px" }}
		>
			<div className="flex min-w-0 items-center gap-2">
				<Icon className={`size-3 shrink-0 ${iconColor}`} />
				<span className="truncate text-[11px] text-muted-foreground">
					{path}
				</span>
			</div>
			{(add > 0 || del > 0) && (
				<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/45">
					{add > 0 && <span>+{add}</span>}
					{del > 0 && <span className="ml-1">−{del}</span>}
				</span>
			)}
		</div>
	);
}
