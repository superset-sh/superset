import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ArrowUpRight, Check, Copy, Send } from "lucide-react";
import { useState } from "react";

interface ReviewToolbarProps {
	onCopyAll?: () => void;
	onSendToAgent?: () => void;
	onOpenInGitHub?: () => void;
	githubUrl?: string;
}

export function ReviewToolbar({
	onCopyAll,
	onSendToAgent,
	onOpenInGitHub,
	githubUrl,
}: ReviewToolbarProps) {
	const [copied, setCopied] = useState(false);

	const handleCopyAll = () => {
		onCopyAll?.();
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="flex items-center gap-1">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleCopyAll}
						className="rounded p-1.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!onCopyAll}
					>
						{copied ? (
							<Check className="size-3.5 text-green-500" />
						) : (
							<Copy className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Copy All
				</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSendToAgent}
						className="rounded p-1.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!onSendToAgent}
					>
						<Send className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Send to Agent
				</TooltipContent>
			</Tooltip>

			{githubUrl && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onOpenInGitHub}
							className="rounded p-1.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!onOpenInGitHub}
						>
							<ArrowUpRight className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Open in GitHub
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
