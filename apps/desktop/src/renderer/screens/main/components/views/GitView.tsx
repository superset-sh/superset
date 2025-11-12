import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GitBranch, GitMerge, Plus, Scan, Star } from "lucide-react";
import type React from "react";

export const GitView: React.FC = () => {
	return (
		<div className="flex flex-col h-full p-3 space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-neutral-300">Worktrees</h2>
				<div className="flex gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon-sm">
								<Scan size={14} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p>Scan for worktrees</p>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon-sm">
								<Plus size={14} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p>Create worktree</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			<div className="space-y-1.5">
				{/* Mock worktree items */}
				{[
					{ name: "main", isMain: true, tabs: 5 },
					{ name: "feature/new-ui", isMain: false, tabs: 3 },
					{ name: "bugfix/terminal-crash", isMain: false, tabs: 2 },
				].map((worktree) => (
					<button
						key={worktree.name}
						type="button"
						className="w-full p-2.5 rounded-md hover:bg-neutral-800 transition-all text-left group"
					>
						<div className="flex items-center gap-2 mb-1">
							<GitBranch size={14} className="text-blue-500 shrink-0" />
							<span className="text-sm text-neutral-200 truncate">
								{worktree.name}
							</span>
							{worktree.isMain && (
								<Star
									size={12}
									className="text-yellow-500 shrink-0"
									fill="currentColor"
								/>
							)}
						</div>
						<div className="text-xs text-neutral-500 pl-5">
							{worktree.tabs} tabs
						</div>
					</button>
				))}
			</div>

			<div className="flex-1" />

			<Button variant="outline" size="sm" className="w-full">
				<GitMerge size={14} />
				<span>Merge Worktree</span>
			</Button>
		</div>
	);
};
