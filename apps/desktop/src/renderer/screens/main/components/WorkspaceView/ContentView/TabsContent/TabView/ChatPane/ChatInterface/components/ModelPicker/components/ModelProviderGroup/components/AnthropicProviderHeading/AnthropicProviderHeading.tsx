import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";

interface AnthropicProviderHeadingProps {
	heading: string;
	isConnected: boolean;
	isPending: boolean;
	onOpenAuthModal: () => void;
}

export function AnthropicProviderHeading({
	heading,
	isConnected,
	isPending,
	onOpenAuthModal,
}: AnthropicProviderHeadingProps) {
	const tooltipLabel = isConnected
		? "Manage Anthropic auth"
		: "Connect Anthropic";

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
							onOpenAuthModal();
						}}
					>
						{isPending ? (
							<Loader2Icon className="size-4 animate-spin" />
						) : (
							<KeyRoundIcon className="size-4" />
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
