import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { AlertCircleIcon } from "lucide-react";
import type React from "react";

interface ChatErrorAction {
	label: string;
	onClick: () => void;
}

interface ChatErrorMessageProps {
	message: React.ReactNode;
	title?: React.ReactNode;
	action?: ChatErrorAction;
	showIcon?: boolean;
	className?: string;
}

export function ChatErrorMessage({
	message,
	title,
	action,
	showIcon = true,
	className,
}: ChatErrorMessageProps) {
	const hasDetailLayout = Boolean(title || action);

	return (
		<div
			className={cn(
				"rounded-md border bg-destructive/10 text-sm text-destructive",
				hasDetailLayout
					? "flex flex-col gap-3 border-destructive/30 px-4 py-3"
					: "border-destructive/20 px-4 py-2",
				!hasDetailLayout && showIcon && "flex items-start gap-2",
				className,
			)}
		>
			<div className={cn(showIcon && "flex items-start gap-2")}>
				{showIcon ? (
					<AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
				) : null}
				<div className={cn(title && "space-y-1")}>
					{title ? <div className="font-medium">{title}</div> : null}
					<div className={cn("select-text", title && "text-destructive/90")}>
						{message}
					</div>
				</div>
			</div>
			{action ? (
				<div className={cn(showIcon && "pl-6")}>
					<Button size="sm" variant="outline" onClick={action.onClick}>
						{action.label}
					</Button>
				</div>
			) : null}
		</div>
	);
}
