"use client";

import { LuGitBranch } from "react-icons/lu";
import { TbCloud } from "react-icons/tb";
import type { WorkspaceStatus } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";
import { StatusIndicator } from "../StatusIndicator";

interface WorkspaceItemProps {
	name: string;
	branch: string;
	add?: number;
	del?: number;
	pr?: string;
	isActive?: boolean;
	status?: WorkspaceStatus;
}

export function WorkspaceItem({
	name,
	add,
	del,
	isActive,
	status,
}: WorkspaceItemProps) {
	const isCloud = name === "see changes";
	const isBranch = name === "forward ports";
	return (
		<div
			className={`relative flex h-7 cursor-pointer items-center gap-2.5 pl-4 pr-3 text-[11px] ${
				isActive
					? "bg-foreground/[0.06] text-foreground"
					: "text-foreground/80 hover:bg-foreground/[0.025] hover:text-foreground/95"
			}`}
		>
			{isActive && (
				<span className="absolute inset-y-0.5 left-0 w-[2px] bg-brand" />
			)}

			<div className="flex size-3 shrink-0 items-center justify-center">
				{status === "working" ? (
					<AsciiSpinner
						className="text-[10px]"
						toneClassName="text-brand-light"
					/>
				) : status ? (
					<StatusIndicator status={status} />
				) : isCloud ? (
					<TbCloud className="size-3.5 text-muted-foreground/70" />
				) : isBranch ? (
					<LuGitBranch className="size-3 text-muted-foreground/70" />
				) : (
					<span className="size-1 rounded-full bg-muted-foreground/40" />
				)}
			</div>

			<span
				className={`min-w-0 flex-1 truncate ${isActive ? "font-medium" : ""}`}
			>
				{name}
			</span>

			{add !== undefined && (
				<span className="shrink-0 font-mono text-[10px] tabular-nums">
					<span className="text-emerald-400/80">+{add}</span>
					{del !== undefined && del > 0 && (
						<span className="ml-1 text-rose-400/75">−{del}</span>
					)}
				</span>
			)}
		</div>
	);
}
