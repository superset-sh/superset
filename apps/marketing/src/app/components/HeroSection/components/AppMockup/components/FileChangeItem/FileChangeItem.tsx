"use client";

import {
	VscChevronRight,
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
	const Icon = isFolder
		? VscChevronRight
		: type === "add"
			? VscDiffAdded
			: type === "edit"
				? VscDiffModified
				: type === "delete"
					? VscDiffRemoved
					: VscDiffModified;

	let iconColor = "text-muted-foreground/30";
	if (isFolder) {
		iconColor = "text-muted-foreground/24";
	} else if (type === "add") {
		iconColor = "text-emerald-300/70";
	} else if (type === "edit") {
		iconColor = "text-[#febc2e]/75";
	} else if (type === "delete") {
		iconColor = "text-rose-300/75";
	}

	return (
		<div
			className={`flex items-center justify-between gap-2 px-3 hover:bg-white/[0.03] ${isFolder ? "mt-1 py-1.5" : "py-1.5"}`}
			style={{ paddingLeft: `${10 + indent * 14}px` }}
		>
			<div className="flex min-w-0 items-center gap-2">
				<Icon
					className={`${isFolder ? "size-2.5" : "size-3.5"} shrink-0 ${iconColor}`}
				/>
				<span
					className={`truncate ${isFolder ? "text-[10px] font-medium text-muted-foreground/34" : "text-[11px] text-muted-foreground/58"}`}
				>
					{path}
				</span>
			</div>
			{!isFolder && (add > 0 || del > 0) && (
				<span className="shrink-0 tabular-nums text-[10px] font-medium">
					{add > 0 && <span className="text-emerald-300/75">+{add}</span>}
					{del > 0 && <span className="ml-1 text-rose-300/75">-{del}</span>}
				</span>
			)}
		</div>
	);
}
