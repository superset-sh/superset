import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Loader2 } from "lucide-react";
import type React from "react";
import { TerminalOutput } from "../../Sidebar/components/CreateWorktreeModal/TerminalOutput";

interface CreatingViewProps {
	setupStatus?: string;
	setupOutput?: string;
	isCreating: boolean;
	onClose: () => void;
}

function getStatusType(status?: string): "error" | "success" | "creating" {
	if (!status) return "creating";

	const lowerStatus = status.toLowerCase();
	if (lowerStatus.includes("failed") || lowerStatus.includes("error")) {
		return "error";
	}
	if (lowerStatus.includes("success") || lowerStatus.includes("completed")) {
		return "success";
	}
	return "creating";
}

export const CreatingView: React.FC<CreatingViewProps> = ({
	setupStatus,
	setupOutput,
	isCreating,
	onClose,
}) => {
	const statusType = getStatusType(setupStatus);
	const isError = statusType === "error";
	const isSuccess = statusType === "success";

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<ScrollArea className="flex-1 min-h-0">
				<div className="px-6 pt-6 pb-4">
					{isCreating && (
						<div className="flex flex-col space-y-3">
							<div className="flex items-center gap-2 text-sm text-neutral-300">
								<Loader2 size={16} className="animate-spin" />
								<span>{setupStatus || "Creating worktree..."}</span>
							</div>

							{setupOutput && (
								<div className="bg-neutral-900 rounded border border-neutral-700 overflow-hidden h-[500px]">
									<TerminalOutput
										output={setupOutput}
										className="w-full h-full"
									/>
								</div>
							)}
						</div>
					)}

					{isSuccess && (
						<div className="flex flex-col space-y-3">
							<div className="flex items-center gap-2 text-sm text-green-400 font-medium">
								<span>{setupStatus}</span>
							</div>

							{setupOutput && (
								<div className="bg-green-500/10 rounded border border-green-500/30 p-3 overflow-auto h-[500px]">
									<pre className="text-green-200 text-xs font-mono whitespace-pre-wrap">
										{setupOutput}
									</pre>
								</div>
							)}
						</div>
					)}

					{isError && (
						<div className="flex flex-col space-y-3">
							<div className="flex items-center gap-2 text-sm text-red-400 font-medium">
								<span>{setupStatus}</span>
							</div>

							{setupOutput && (
								<div className="bg-red-500/10 rounded border border-red-500/30 p-3 overflow-auto h-[500px]">
									<pre className="text-red-200 text-xs font-mono whitespace-pre-wrap">
										{setupOutput}
									</pre>
								</div>
							)}
						</div>
					)}
				</div>
			</ScrollArea>

			<div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-end gap-2 shrink-0">
				<Button
					type="button"
					variant="ghost"
					onClick={onClose}
					disabled={isCreating}
				>
					{isCreating ? "Creating..." : "Close"}
				</Button>
			</div>
		</div>
	);
};
