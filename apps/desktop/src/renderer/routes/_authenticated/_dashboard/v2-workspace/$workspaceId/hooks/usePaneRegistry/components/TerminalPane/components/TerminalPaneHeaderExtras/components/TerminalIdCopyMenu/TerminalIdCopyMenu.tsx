import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Bot, Check, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

interface TerminalIdCopyMenuProps {
	workspaceId: string;
	terminalId: string;
}

export function TerminalIdCopyMenu({
	workspaceId,
	terminalId,
}: TerminalIdCopyMenuProps) {
	const { t } = useLingui();
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const agentSessionId = binding?.agentSessionId;
	const { copyToClipboard, copied } = useCopyToClipboard();
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

	const copyId = (value: string, label: string) => {
		setCopiedLabel(label);
		void copyToClipboard(value);
	};

	const tooltipLabel =
		copiedLabel && copied
			? t({
					id: "workspace.terminalPane.copiedIdTooltip",
					message: `Copied ${copiedLabel}`,
				})
			: t({
					id: "workspace.terminalPane.copyIdsTooltip",
					message: "Copy IDs",
				});
	const buttonClassName =
		"rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground";

	if (!agentSessionId) {
		const terminalTooltipLabel = copied
			? t({
					id: "workspace.terminalPane.copiedTerminalIdTooltip",
					message: "Copied terminal ID",
				})
			: t({
					id: "workspace.terminalPane.copyTerminalIdTooltip",
					message: "Copy terminal ID",
				});

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={terminalTooltipLabel}
						className={buttonClassName}
						onClick={() =>
							copyId(
								terminalId,
								t({
									id: "workspace.terminalPane.terminalIdLabel",
									message: "terminal ID",
								}),
							)
						}
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
		<DropdownMenu>
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
				<DropdownMenuItem
					onSelect={() =>
						copyId(
							terminalId,
							t({
								id: "workspace.terminalPane.terminalIdMenuLabel",
								message: "terminal ID",
							}),
						)
					}
				>
					<TerminalSquare />
					<Trans id="workspace.terminalPane.copyTerminalId">
						Copy terminal ID
					</Trans>
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() =>
						copyId(
							agentSessionId,
							t({
								id: "workspace.terminalPane.agentSessionIdMenuLabel",
								message: "agent session ID",
							}),
						)
					}
				>
					<Bot />
					<Trans id="workspace.terminalPane.copyAgentSessionId">
						Copy agent session ID
					</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
