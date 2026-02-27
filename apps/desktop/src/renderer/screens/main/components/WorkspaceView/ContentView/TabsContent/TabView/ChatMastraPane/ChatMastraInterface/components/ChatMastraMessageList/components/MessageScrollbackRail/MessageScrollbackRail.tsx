import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import { useConversationContext } from "@superset/ui/ai-elements/conversation";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessagePart = MastraMessage["content"][number];

const JUMP_TOP_OFFSET_PX = 8;
const HOVER_CARD_RIGHT_EDGE_OFFSET_PX = -28;

interface MessageScrollbackRailProps {
	messages: MastraMessage[];
}

function buildPreview(message: MastraMessage): string {
	const textContent = message.content
		.filter(
			(
				part: MastraMessagePart,
			): part is Extract<MastraMessagePart, { type: "text" }> =>
				part.type === "text",
		)
		.map((part: { type: "text"; text: string }) => part.text.trim())
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (textContent) {
		return textContent;
	}

	const attachmentCount = message.content.filter(
		(part: MastraMessagePart) => part.type === "image",
	).length;
	if (attachmentCount > 0) {
		return attachmentCount === 1
			? "Sent 1 attachment"
			: `Sent ${attachmentCount} attachments`;
	}

	return "(empty message)";
}

function findUserMessageElement(
	scrollElement: HTMLElement,
	messageId: string,
): HTMLElement | null {
	const userMessageElements = scrollElement.querySelectorAll<HTMLElement>(
		"[data-chat-user-message='true'][data-message-id]",
	);

	for (const element of userMessageElements) {
		if (element.dataset.messageId === messageId) {
			return element;
		}
	}

	return null;
}

function findActiveMessageId(
	entries: { id: string; top: number }[],
	scrollTop: number,
): string | null {
	if (entries.length === 0) {
		return null;
	}

	let activeId = entries[0]?.id ?? null;
	const adjustedTop = scrollTop + 4;

	for (const entry of entries) {
		if (entry.top <= adjustedTop) {
			activeId = entry.id;
			continue;
		}
		break;
	}

	return activeId;
}

export function MessageScrollbackRail({
	messages,
}: MessageScrollbackRailProps) {
	const { scrollRef, stopScroll } = useConversationContext();
	const [entries, setEntries] = useState<
		{ id: string; preview: string; top: number; isLatest: boolean }[]
	>([]);
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
	const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
	const [isCardOpen, setIsCardOpen] = useState(false);
	const [dismissedByClick, setDismissedByClick] = useState(false);
	const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const userMessages = useMemo(() => {
		const filtered = messages.filter((msg) => msg.role === "user");
		return filtered.map((msg, index) => ({
			id: msg.id,
			preview: buildPreview(msg),
			isLatest: index === filtered.length - 1,
		}));
	}, [messages]);

	const recalculateEntries = useCallback(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement || userMessages.length === 0) {
			setEntries([]);
			setActiveMessageId(null);
			return;
		}

		const scrollElementRect = scrollElement.getBoundingClientRect();
		const nextEntries = userMessages.map((message, index) => {
			const targetElement = findUserMessageElement(scrollElement, message.id);
			const fallbackTop = userMessages.length <= 1 ? 0 : index * 64;
			const top = targetElement
				? targetElement.getBoundingClientRect().top -
					scrollElementRect.top +
					scrollElement.scrollTop
				: fallbackTop;

			return { ...message, top };
		});

		setEntries(nextEntries);
		setActiveMessageId(
			findActiveMessageId(nextEntries, scrollElement.scrollTop),
		);
	}, [scrollRef, userMessages]);

	useEffect(() => {
		const frame = requestAnimationFrame(recalculateEntries);
		return () => cancelAnimationFrame(frame);
	}, [recalculateEntries]);

	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement) {
			return;
		}

		const handleScroll = () => {
			setActiveMessageId(findActiveMessageId(entries, scrollElement.scrollTop));
		};

		scrollElement.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			scrollElement.removeEventListener("scroll", handleScroll);
		};
	}, [entries, scrollRef]);

	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement) {
			return;
		}

		const resizeObserver = new ResizeObserver(() => {
			recalculateEntries();
		});
		resizeObserver.observe(scrollElement);

		const handleWindowResize = () => {
			recalculateEntries();
		};
		window.addEventListener("resize", handleWindowResize);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", handleWindowResize);
		};
	}, [recalculateEntries, scrollRef]);

	useEffect(
		() => () => {
			if (dismissTimeoutRef.current) {
				clearTimeout(dismissTimeoutRef.current);
			}
		},
		[],
	);

	const handleCardOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen && dismissedByClick) {
				return;
			}
			setIsCardOpen(nextOpen);
		},
		[dismissedByClick],
	);

	const handleJumpToMessage = useCallback(
		(messageId: string) => {
			const scrollElement = scrollRef.current;
			if (!scrollElement) {
				return;
			}

			const targetElement = findUserMessageElement(scrollElement, messageId);
			if (!targetElement) {
				return;
			}

			stopScroll();
			const scrollElementRect = scrollElement.getBoundingClientRect();
			const nextScrollTop =
				targetElement.getBoundingClientRect().top -
				scrollElementRect.top +
				scrollElement.scrollTop -
				JUMP_TOP_OFFSET_PX;

			scrollElement.scrollTo({
				top: Math.max(0, nextScrollTop),
				behavior: "smooth",
			});
			setActiveMessageId(messageId);
			setDismissedByClick(true);
			setIsCardOpen(false);
			if (dismissTimeoutRef.current) {
				clearTimeout(dismissTimeoutRef.current);
			}
			dismissTimeoutRef.current = setTimeout(() => {
				setDismissedByClick(false);
			}, 250);
		},
		[scrollRef, stopScroll],
	);

	if (entries.length === 0) {
		return null;
	}

	const emphasizedMessageId = hoveredMessageId ?? activeMessageId;

	return (
		<div className="absolute top-4 right-3 z-20 flex items-start">
			<HoverCard
				open={isCardOpen}
				onOpenChange={handleCardOpenChange}
				openDelay={60}
				closeDelay={180}
			>
				<HoverCardTrigger asChild>
					<div className="w-7 max-h-[calc(100vh-12rem)] cursor-default overflow-hidden p-1">
						<div className="flex flex-col gap-1.5">
							{entries.map((entry) => {
								const isEmphasized = emphasizedMessageId === entry.id;
								const markerColorClass = entry.isLatest
									? isEmphasized
										? "bg-muted-foreground/55"
										: "bg-muted-foreground/12"
									: isEmphasized
										? "bg-foreground"
										: "bg-muted-foreground/30 hover:bg-muted-foreground/45";

								return (
									<button
										key={entry.id}
										type="button"
										className={cn(
											"h-0.5 w-full flex-shrink-0 rounded-full transition-all",
											markerColorClass,
										)}
										onMouseEnter={() => setHoveredMessageId(entry.id)}
										onMouseLeave={() => setHoveredMessageId(null)}
										onFocus={() => setHoveredMessageId(entry.id)}
										onBlur={() => setHoveredMessageId(null)}
										onClick={() => handleJumpToMessage(entry.id)}
										aria-label={`Jump to message: ${entry.preview}`}
									/>
								);
							})}
						</div>
					</div>
				</HoverCardTrigger>

				<HoverCardContent
					align="start"
					className="w-72 border-border/70 bg-background/95 p-2 backdrop-blur-sm"
					side="left"
					sideOffset={HOVER_CARD_RIGHT_EDGE_OFFSET_PX}
				>
					<div className="max-h-[65vh] overflow-y-auto">
						{entries.map((entry) => {
							const isEmphasized = emphasizedMessageId === entry.id;
							const entryClassName = entry.isLatest
								? isEmphasized
									? "bg-muted/65 text-muted-foreground/90"
									: "text-muted-foreground/60 hover:text-muted-foreground/85"
								: isEmphasized
									? "bg-primary/10 text-primary/85"
									: "text-muted-foreground/85 hover:text-foreground/90";

							return (
								<button
									key={entry.id}
									type="button"
									className={cn(
										"block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors",
										entryClassName,
									)}
									onMouseEnter={() => setHoveredMessageId(entry.id)}
									onMouseLeave={() => setHoveredMessageId(null)}
									onFocus={() => setHoveredMessageId(entry.id)}
									onBlur={() => setHoveredMessageId(null)}
									onClick={() => handleJumpToMessage(entry.id)}
								>
									{entry.preview}
								</button>
							);
						})}
					</div>
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}
