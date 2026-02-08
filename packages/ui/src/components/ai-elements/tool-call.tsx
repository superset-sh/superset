"use client";

import type { ComponentType } from "react";
import { cn } from "../../lib/utils";
import { Shimmer } from "./shimmer";

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
	icon: Icon,
	title,
	subtitle,
	isPending,
	isError,
	onClick,
	className,
}: ToolCallProps) => {
	const content = (
		<>
			<Icon
				className={cn(
					"size-3.5 shrink-0",
					isError ? "text-red-500" : "text-muted-foreground",
				)}
			/>
			{isPending ? (
				<Shimmer as="span" className="text-xs">
					{title}
				</Shimmer>
			) : (
				<span
					className={cn(
						"text-xs",
						isError ? "text-red-500" : "text-muted-foreground",
					)}
				>
					{title}
				</span>
			)}
			{subtitle && (
				<span className="min-w-0 truncate text-muted-foreground/70 text-xs">
					{subtitle}
				</span>
			)}
		</>
	);

	if (onClick) {
		return (
			<button
				className={cn(
					"not-prose flex items-center gap-2 rounded-md py-1 cursor-pointer hover:bg-muted/50",
					className,
				)}
				onClick={onClick}
				type="button"
			>
				{content}
			</button>
		);
	}

	return (
		<div
			className={cn(
				"not-prose flex items-center gap-2 rounded-md py-1",
				className,
			)}
		>
			{content}
		</div>
	);
};
