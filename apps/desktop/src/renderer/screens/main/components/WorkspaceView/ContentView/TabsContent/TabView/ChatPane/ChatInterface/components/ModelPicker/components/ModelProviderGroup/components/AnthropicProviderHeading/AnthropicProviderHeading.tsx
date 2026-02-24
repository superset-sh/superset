import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Loader2Icon, Settings2Icon } from "lucide-react";

interface AnthropicProviderHeadingProps {
	heading: string;
	isConnected: boolean;
	isPending: boolean;
	onStartOAuth: () => void;
}

export function AnthropicProviderHeading({
	heading,
	isConnected,
	isPending,
	onStartOAuth,
}: AnthropicProviderHeadingProps) {
	const tooltipLabel = isConnected ? "Re-auth Anthropic" : "Connect Anthropic";

	return (
		<div className="text-muted-foreground flex items-center justify-between px-2 py-1.5 text-xs font-medium">
			<span>{heading}</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={tooltipLabel}
						className="text-muted-foreground hover:text-foreground size-6"
						disabled={isPending}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							onStartOAuth();
						}}
					>
						{isPending ? (
							<Loader2Icon className="size-4 animate-spin" />
						) : (
							<Settings2Icon className="size-4" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={6} showArrow={false}>
					{tooltipLabel}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
