import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Plus, SquareTerminal } from "lucide-react";
import type React from "react";

export const TerminalsView: React.FC = () => {
	return (
		<div className="flex flex-col h-full p-3 space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-neutral-300">Terminals</h2>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm">
							<Plus size={14} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>New terminal</p>
					</TooltipContent>
				</Tooltip>
			</div>

			<ScrollArea className="flex-1">
				<div className="space-y-1.5">
					{/* Mock terminal items */}
					{[
						{
							id: "1",
							name: "Terminal 1",
							cwd: "~/code/superset",
							worktree: "main",
						},
						{
							id: "2",
							name: "Terminal 2",
							cwd: "~/code/superset/apps/desktop",
							worktree: "feature/new-ui",
						},
						{
							id: "3",
							name: "Dev Server",
							cwd: "~/code/superset",
							worktree: "feature/new-ui",
						},
					].map((terminal) => (
						<button
							key={terminal.id}
							type="button"
							className="w-full p-2.5 rounded-md hover:bg-neutral-800 transition-all text-left group"
						>
							<div className="flex items-center gap-2 mb-1">
								<SquareTerminal size={14} className="text-green-500 shrink-0" />
								<span className="text-sm text-neutral-200 truncate">
									{terminal.name}
								</span>
							</div>
							<div className="text-xs text-neutral-500 pl-5 space-y-0.5">
								<div className="truncate">{terminal.cwd}</div>
								<div className="text-blue-500">{terminal.worktree}</div>
							</div>
						</button>
					))}
				</div>
			</ScrollArea>
		</div>
	);
};
