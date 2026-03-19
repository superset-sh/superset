"use client";

import { LuFolderGit2, LuGitPullRequest } from "react-icons/lu";
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
	branch,
	add,
	del,
	pr,
	isActive,
	status,
}: WorkspaceItemProps) {
	return (
		<div
			className={`relative flex cursor-pointer items-start gap-3 px-3 py-2 text-[11px] ${isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"}`}
		>
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-orange-500/80" />
			)}
			<div className="relative mt-0.5 text-muted-foreground/30">
				{status === "working" ? (
					<AsciiSpinner className="text-xs" />
				) : (
					<LuFolderGit2 className="size-4" />
				)}
				{status && status !== "working" && (
					<span className="absolute -top-0.5 -right-0.5">
						<StatusIndicator status={status} />
					</span>
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between gap-1">
					<span
						className={`truncate ${isActive ? "text-foreground font-medium" : "text-foreground/55"}`}
					>
						{name}
					</span>
					{(add !== undefined || pr) && (
						<div className="flex items-center gap-1 shrink-0">
							{add !== undefined && (
								<span className="text-[10px] font-medium tabular-nums">
									<span className="text-emerald-300/75">+{add}</span>
									{del !== undefined && del > 0 && (
										<span className="ml-0.5 text-rose-300/75">-{del}</span>
									)}
								</span>
							)}
						</div>
					)}
				</div>
				<div className="flex items-center justify-between">
					<span className="truncate font-mono text-[10px] text-muted-foreground/28">
						{branch}
					</span>
					{pr && (
						<span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/24">
							<LuGitPullRequest className="size-3" />
							{pr}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
