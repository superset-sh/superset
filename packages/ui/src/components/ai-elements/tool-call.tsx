"use client";

import type { ComponentType } from "react";
import { cn } from "../../lib/utils";
import { ShimmerLabel } from "./shimmer-label";

export type ToolCallProps = {
	icon: ComponentType<{ className?: string }>;
	title: string;
	subtitle?: string;
	isPending: boolean;
	isError: boolean;
	onClick?: () => void;
	className?: string;
};

export const ToolCall = ({
	icon: _Icon,
	title,
	subtitle,
	isPending,
	isError: _isError,
	onClick,
	className,
}: ToolCallProps) => {
	const clickableClass = onClick
		? "cursor-pointer hover:text-muted-foreground transition-colors"
		: "";

	return (
		<div
			className={cn("flex items-start gap-1.5 rounded-md py-0.5", className)}
		>
			<div className="min-w-0 flex flex-1 items-center gap-1.5">
				<div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					<ShimmerLabel isShimmering={isPending}>{title}</ShimmerLabel>
					{subtitle && (
						// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: clickable subtitle
						<span
							className={cn(
								"min-w-0 truncate font-normal text-muted-foreground/60",
								clickableClass,
							)}
							onClick={onClick}
						>
							{subtitle}
						</span>
					)}
				</div>
			</div>
		</div>
	);
};
