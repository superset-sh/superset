import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { LuRefreshCw } from "react-icons/lu";

interface WorkItemDetailStateProps {
	message: string;
	isLoading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
	/** What fixes the failure, offered beside "Try again". */
	action?: { label: string; onClick: () => void };
}

export function WorkItemDetailState({
	message,
	isLoading = false,
	isError = false,
	onRetry,
	action,
}: WorkItemDetailStateProps) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-sm",
				isError ? "text-destructive" : "text-muted-foreground",
				(isError || onRetry) && "cursor-text select-text",
			)}
			role={isError ? "alert" : "status"}
			aria-live="polite"
		>
			{isLoading && (
				<LuRefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
			)}
			<span className="max-w-prose text-wrap-pretty">{message}</span>
			{(action || onRetry) && (
				<div className="flex items-center gap-2">
					{action && (
						<Button size="sm" onClick={action.onClick}>
							{action.label}
						</Button>
					)}
					{onRetry && (
						<Button variant="outline" size="sm" onClick={onRetry}>
							<Trans>Try again</Trans>
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
