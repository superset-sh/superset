"use client";

import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Loader } from "./loader";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
	<StickToBottom
		className={cn("relative flex-1 overflow-y-hidden", className)}
		initial="instant"
		resize="instant"
		role="log"
		{...props}
	/>
);

export type ConversationContentProps = ComponentProps<
	typeof StickToBottom.Content
>;

export const ConversationContent = ({
	className,
	...props
}: ConversationContentProps) => {
	const { stopScroll } = useStickToBottomContext();

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if ((e.target as Element).closest("[data-tool-trigger]")) {
				// Unpin from bottom so the resize handler never jumps the scroll position.
				stopScroll();
			}
		},
		[stopScroll],
	);

	return (
		<StickToBottom.Content
			className={cn("flex flex-col gap-8 p-4 select-text", className)}
			scrollClassName="[overflow-anchor:none]"
			onMouseDown={handleMouseDown}
			{...props}
		/>
	);
};

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
	title?: string;
	description?: string;
	icon?: React.ReactNode;
};

type ConversationStateContainerProps = ComponentProps<"div">;

const ConversationStateContainer = ({
	className,
	children,
	...props
}: ConversationStateContainerProps) => (
	<div
		className={cn(
			"flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
			className,
		)}
		{...props}
	>
		{children}
	</div>
);

export const ConversationEmptyState = ({
	className,
	title = "No messages yet",
	description = "Start a conversation to see messages here",
	icon,
	children,
	...props
}: ConversationEmptyStateProps) => (
	<ConversationStateContainer className={className} {...props}>
		{children ?? (
			<>
				{icon && <div className="text-muted-foreground">{icon}</div>}
				<div className="space-y-1">
					<h3 className="font-medium text-sm">{title}</h3>
					{description && (
						<p className="text-muted-foreground text-sm">{description}</p>
					)}
				</div>
			</>
		)}
	</ConversationStateContainer>
);

export type ConversationLoadingStateProps = ComponentProps<"div"> & {
	label?: string;
	icon?: React.ReactNode;
};

export const ConversationLoadingState = ({
	className,
	label = "Loading conversation...",
	icon,
	children,
	...props
}: ConversationLoadingStateProps) => (
	<ConversationStateContainer className={className} {...props}>
		{children ?? (
			<>
				{icon ?? <Loader className="text-muted-foreground" size={14} />}
				<p className="text-muted-foreground text-sm">{label}</p>
			</>
		)}
	</ConversationStateContainer>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
	className,
	...props
}: ConversationScrollButtonProps) => {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();

	const handleScrollToBottom = useCallback(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	return (
		!isAtBottom && (
			<Button
				className={cn(
					"absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full",
					className,
				)}
				onClick={handleScrollToBottom}
				size="icon"
				type="button"
				variant="outline"
				{...props}
			>
				<ArrowDownIcon className="size-4" />
			</Button>
		)
	);
};

export const useConversationContext = useStickToBottomContext;
