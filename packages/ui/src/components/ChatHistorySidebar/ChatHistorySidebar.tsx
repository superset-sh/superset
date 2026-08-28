"use client";

import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { type Point, useSafeTriangleHover } from "./hooks/useSafeTriangleHover";
import "./chat-history-rail.css";

export type ChatHistorySidebarMessage = {
	id: string;
	role: "user" | "assistant";
	preview: string;
};

export type ChatHistorySidebarProps = {
	messages: ChatHistorySidebarMessage[];
	activeMessageIds?: string[];
	onMessageSelect?: (message: ChatHistorySidebarMessage) => void;
	className?: string;
};

const MIN_ITEMS = 4;

type RailItem = {
	message: ChatHistorySidebarMessage;
	response?: string;
};

function toRailItems(messages: ChatHistorySidebarMessage[]): RailItem[] {
	return messages.flatMap((message, index) => {
		if (message.role !== "user") return [];
		const next = messages[index + 1];
		return [
			{
				message,
				response: next?.role === "assistant" ? next.preview : undefined,
			},
		];
	});
}

type HoveredRow = {
	item: RailItem;
	top: number;
};

export function ChatHistorySidebar({
	messages,
	activeMessageIds,
	onMessageSelect,
	className,
}: ChatHistorySidebarProps) {
	const { t } = useLingui();
	const wrapperRef = useRef<HTMLElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const [hovered, setHovered] = useState<HoveredRow | null>(null);
	const safeTriangle = useSafeTriangleHover<HoveredRow>({
		onOpen: setHovered,
		onClose: () => setHovered(null),
	});

	const items = toRailItems(messages);
	const activeItems = activeMessageIds
		? items.filter((item) => activeMessageIds.includes(item.message.id))
		: [];
	const firstActiveId = activeItems.at(0)?.message.id;
	const lastActiveId = activeItems.at(-1)?.message.id;

	useLayoutEffect(() => {
		if (hovered != null || firstActiveId == null || lastActiveId == null)
			return;
		const list = listRef.current;
		if (list == null) return;
		const rowFor = (id: string) =>
			list.querySelector<HTMLElement>(
				`[data-rail-item-id="${CSS.escape(id)}"]`,
			);
		const firstRow = rowFor(firstActiveId);
		const lastRow = rowFor(lastActiveId);
		if (firstRow == null || lastRow == null) return;
		let target = list.scrollTop;
		const lastRowBottom = lastRow.offsetTop + lastRow.offsetHeight;
		if (lastRowBottom > target + list.clientHeight) {
			target = lastRowBottom - list.clientHeight + 1;
		}
		if (firstRow.offsetTop < target) {
			target = firstRow.offsetTop;
		}
		if (target !== list.scrollTop) {
			list.scrollTop = target;
		}
	}, [firstActiveId, lastActiveId, hovered]);

	if (items.length < MIN_ITEMS) return null;

	const handleRowEnter = (
		row: HTMLElement,
		item: RailItem,
		enterPoint?: Point,
	) => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const rowRect = row.getBoundingClientRect();
		const wrapperRect = wrapper.getBoundingClientRect();
		safeTriangle.rowPointerEnter(
			item.message.id,
			{
				item,
				top: rowRect.top - wrapperRect.top + rowRect.height / 2,
			},
			enterPoint,
		);
	};

	return (
		<nav
			ref={wrapperRef}
			aria-label={t({
				id: "ui.chatHistorySidebar.label",
				message: "User messages",
			})}
			className={cn("chat-history-rail relative", className)}
			onPointerMove={(event) =>
				safeTriangle.containerPointerMove({
					x: event.clientX,
					y: event.clientY,
				})
			}
			onPointerLeave={() => safeTriangle.containerPointerLeave()}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					safeTriangle.forceClose();
				}
			}}
		>
			<div
				ref={listRef}
				className="chat-history-rail-list relative flex max-h-[min(70vh,40rem)] flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]"
			>
				{items.map((item, index) => {
					const position = index + 1;
					return (
						<button
							key={item.message.id}
							type="button"
							data-rail-item-id={item.message.id}
							aria-current={
								activeMessageIds?.includes(item.message.id) ? "true" : undefined
							}
							aria-label={t({
								id: "ui.chatHistorySidebar.jumpToMessage",
								message: `Jump to user message ${position}`,
							})}
							className="chat-history-rail-row group flex h-2.5 w-9 shrink-0 cursor-pointer items-center outline-none"
							onClick={() => onMessageSelect?.(item.message)}
							onPointerEnter={(event) =>
								handleRowEnter(event.currentTarget, item, {
									x: event.clientX,
									y: event.clientY,
								})
							}
							onPointerLeave={(event) =>
								safeTriangle.rowPointerLeave(item.message.id, {
									x: event.clientX,
									y: event.clientY,
								})
							}
							onFocus={(event) => handleRowEnter(event.currentTarget, item)}
						>
							<span className="flex h-0.5 w-[30px] items-center">
								<span className="chat-history-rail-marker" />
							</span>
						</button>
					);
				})}
			</div>
			<AnimatePresence>
				{hovered && (
					<motion.div
						ref={safeTriangle.setCardElement}
						onPointerEnter={safeTriangle.cardPointerEnter}
						className="absolute left-full z-50 w-80 -translate-y-1/2 overflow-hidden rounded-xl bg-popover/95 p-2 text-sm leading-5 text-popover-foreground shadow-xl ring-[0.5px] ring-border backdrop-blur-sm"
						initial={{ opacity: 0, top: hovered.top }}
						animate={{ opacity: 1, top: hovered.top }}
						exit={{ opacity: 0, pointerEvents: "none" }}
						transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
					>
						<div className="truncate font-medium">
							{hovered.item.message.preview}
						</div>
						{hovered.item.response && (
							<p className="mt-1 line-clamp-3 text-muted-foreground">
								{hovered.item.response}
							</p>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</nav>
	);
}
