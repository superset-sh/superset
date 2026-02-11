import type * as React from "react";
import { LuX } from "react-icons/lu";

import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";

interface SidebarCardProps {
	badge?: string;
	title: string;
	description?: string;
	actionLabel?: string;
	onAction?: () => void;
	onDismiss?: () => void;
	className?: string;
	children?: React.ReactNode;
}

function SidebarCard({
	badge,
	title,
	description,
	actionLabel,
	onAction,
	onDismiss,
	className,
	children,
}: SidebarCardProps) {
	return (
		<div
			data-slot="sidebar-card"
			className={cn(
				"relative rounded-lg border border-border bg-card p-3",
				className,
			)}
		>
			{badge && <Badge variant="box">{badge}</Badge>}

			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Dismiss"
					className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
				>
					<LuX className="size-3.5" />
				</button>
			)}

			<p
				className={cn(
					"text-sm font-semibold text-card-foreground",
					badge && "mt-2",
				)}
			>
				{title}
			</p>

			{description && (
				<p className="text-xs text-muted-foreground mt-1 leading-snug">
					{description}
				</p>
			)}

			{children}

			{actionLabel && onAction && (
				<Button
					variant="outline"
					size="sm"
					className="mt-3 w-full h-7 text-xs"
					onClick={onAction}
				>
					{actionLabel}
				</Button>
			)}
		</div>
	);
}

export { SidebarCard, type SidebarCardProps };
