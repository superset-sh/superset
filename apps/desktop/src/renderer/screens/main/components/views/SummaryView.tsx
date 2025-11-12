import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Send } from "lucide-react";
import type React from "react";
import { useState } from "react";

export const SummaryView: React.FC = () => {
	const [prompt, setPrompt] = useState("");

	return (
		<div className="flex flex-col h-full">
			<ScrollArea className="flex-1 p-3">
				<div className="space-y-3">
					<h2 className="text-sm font-semibold text-neutral-300">
						Agent Activity
					</h2>

					{/* Mock agent reports */}
					<div className="space-y-2">
						{[
							{
								timestamp: "2 minutes ago",
								action: "Created new component StatusIndicator.tsx",
								status: "success",
							},
							{
								timestamp: "5 minutes ago",
								action: "Updated workspace configuration",
								status: "success",
							},
							{
								timestamp: "8 minutes ago",
								action: "Waiting for feedback on merge strategy",
								status: "waiting",
							},
						].map((report, idx) => (
							<div
								key={idx}
								className="p-2.5 bg-neutral-800/50 rounded-md border-l-2 border-blue-500"
							>
								<div className="flex items-start justify-between mb-1">
									<span className="text-xs text-neutral-500">
										{report.timestamp}
									</span>
									<span
										className={`text-xs px-1.5 py-0.5 rounded ${
											report.status === "success"
												? "bg-green-500/20 text-green-400"
												: "bg-orange-500/20 text-orange-400"
										}`}
									>
										{report.status}
									</span>
								</div>
								<p className="text-sm text-neutral-200">{report.action}</p>
							</div>
						))}
					</div>
				</div>
			</ScrollArea>

			{/* Prompt iteration area */}
			<div className="border-t border-neutral-700 p-3">
				<label
					htmlFor="prompt-input"
					className="text-xs text-neutral-500 mb-2 block"
				>
					Iterate on prompt
				</label>
				<div className="flex gap-2">
					<textarea
						id="prompt-input"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Refine your instructions..."
						className="flex-1 p-2 text-sm bg-neutral-900 text-neutral-200 border border-neutral-700 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
						rows={3}
					/>
					<Button size="icon-sm" className="self-end">
						<Send size={14} />
					</Button>
				</div>
			</div>
		</div>
	);
};
