import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Bot, Check, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

interface TerminalIdCopyMenuProps {
	workspaceId: string;
	terminalId: string;
	isActive: boolean;
}

export function TerminalIdCopyMenu({
	workspaceId,
	terminalId,
	isActive,
}: TerminalIdCopyMenuProps) {
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const agentSessionId = binding?.agentSessionId;
	const { copyToClipboard, copied } = useCopyToClipboard();
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	const copyId = (value: string, label: string) => {
		setCopiedLabel(label);
		void copyToClipboard(value);
	};

	const tooltipLabel =
		copiedLabel && copied ? `Copied ${copiedLabel}` : "Copy IDs";
	const buttonClassName = cn(
		"flex size-5 items-center justify-center text-muted-foreground transition-[color,opacity] hover:text-foreground focus-visible:opacity-100",
		isActive || (Boolean(agentSessionId) && isOpen)
			? "opacity-100"
			: "opacity-0 group-hover/pane-header:opacity-100",
	);

	if (!agentSessionId) {
		const terminalTooltipLabel = copied
			? "Copied terminal ID"
			: "Copy terminal ID";

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={terminalTooltipLabel}
						className={buttonClassName}
						onClick={() => copyId(terminalId, "terminal ID")}
					>
						{copied ? (
							<Check className="size-3.5" />
						) : (
							<Copy className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{terminalTooltipLabel}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={tooltipLabel}
							className={buttonClassName}
						>
							{copied ? (
								<Check className="size-3.5" />
							) : (
								<Copy className="size-3.5" />
							)}
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuItem onSelect={() => copyId(terminalId, "terminal ID")}>
					<TerminalSquare />
					Copy terminal ID
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => copyId(agentSessionId, "agent session ID")}
				>
					<Bot />
					Copy agent session ID
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
