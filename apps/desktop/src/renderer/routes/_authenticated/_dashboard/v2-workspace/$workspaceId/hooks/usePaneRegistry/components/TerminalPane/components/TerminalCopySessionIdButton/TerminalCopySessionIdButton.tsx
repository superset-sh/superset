import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

interface TerminalCopySessionIdButtonProps {
	terminalId: string;
}

export function TerminalCopySessionIdButton({
	terminalId,
}: TerminalCopySessionIdButtonProps) {
	const { copyToClipboard, copied } = useCopyToClipboard();

	async function handleCopy() {
		try {
			await copyToClipboard(terminalId);
			// The id itself is the useful payload to surface — it lets the user
			// confirm what landed on the clipboard before pasting it into a deep
			// link (#5029) or a CLI/MCP command (#4813).
			toast.success("Session ID copied", { description: terminalId });
		} catch {
			toast.error("Failed to copy session ID");
		}
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						void handleCopy();
					}}
					aria-label="Copy session ID"
					className={cn(
						"rounded p-1 transition-colors",
						"text-muted-foreground hover:text-foreground",
					)}
				>
					{copied ? (
						<Check className="size-3.5" />
					) : (
						<Copy className="size-3.5" />
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{copied ? "Copied!" : "Copy session ID"}
			</TooltipContent>
		</Tooltip>
	);
}
