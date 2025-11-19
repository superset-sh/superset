import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ExternalLink, Monitor, Plus } from "lucide-react";
import type React from "react";

export const BrowserView: React.FC = () => {
	return (
		<div className="flex flex-col h-full p-3 space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-neutral-300">Browser</h2>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm">
							<Plus size={14} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>New preview</p>
					</TooltipContent>
				</Tooltip>
			</div>

			{/* URL input */}
			<div className="flex gap-2">
				<input
					type="text"
					placeholder="Enter URL..."
					className="flex-1 px-3 py-2 text-sm bg-neutral-900 text-neutral-200 border border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
				/>
				<Button size="sm">Open</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="space-y-1.5">
					{/* Mock preview items */}
					{[
						{
							id: "1",
							name: "localhost:3000",
							url: "http://localhost:3000",
							worktree: "main",
						},
						{
							id: "2",
							name: "localhost:4927",
							url: "http://localhost:4927",
							worktree: "feature/new-ui",
						},
						{
							id: "3",
							name: "Docs",
							url: "http://localhost:3001/docs",
							worktree: "main",
						},
					].map((preview) => (
						<button
							key={preview.id}
							type="button"
							className="w-full p-2.5 rounded-md hover:bg-neutral-800 transition-all text-left group"
						>
							<div className="flex items-center gap-2 mb-1">
								<Monitor size={14} className="text-purple-500 shrink-0" />
								<span className="text-sm text-neutral-200 truncate">
									{preview.name}
								</span>
								<ExternalLink
									size={12}
									className="text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0"
								/>
							</div>
							<div className="text-xs text-neutral-500 pl-5 space-y-0.5">
								<div className="truncate">{preview.url}</div>
								<div className="text-blue-500">{preview.worktree}</div>
							</div>
						</button>
					))}
				</div>
			</ScrollArea>
		</div>
	);
};
