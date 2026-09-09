"use client";

import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { FrameRect } from "@superset/shared/page-comments-runtime";
import { MessageSquare, ThumbsUp, Trash2, X, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { FastMenu } from "./components/FastMenu";
import { APPROVE_BODY, DELETE_BODY } from "./constants";
import { toolbarPlacement } from "./utils/toolbarPlacement";

const ESTIMATED_SIZE = { width: 210, height: 44 };

interface SelectionToolbarProps {
	rect: FrameRect;
	container: { width: number; height: number };
	onComment: () => void;
	onQuick: (body: MessageDescriptor) => void;
	onDismiss: () => void;
}

export function SelectionToolbar({
	rect,
	container,
	onComment,
	onQuick,
	onDismiss,
}: SelectionToolbarProps) {
	const { t } = useLingui();
	const barRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState(ESTIMATED_SIZE);
	const [menuOpen, setMenuOpen] = useState(false);

	useLayoutEffect(() => {
		const bar = barRef.current;
		if (!bar) return;
		const measure = () =>
			setSize((previous) =>
				previous.width === bar.offsetWidth &&
				previous.height === bar.offsetHeight
					? previous
					: { width: bar.offsetWidth, height: bar.offsetHeight },
			);
		const observer = new ResizeObserver(measure);
		observer.observe(bar);
		measure();
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			if (barRef.current?.contains(target)) return;
			if (target?.closest("[data-comment-ui]")) return;
			onDismiss();
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		return () =>
			document.removeEventListener("pointerdown", onPointerDown, true);
	}, [onDismiss]);

	const { left, top } = toolbarPlacement({ rect, container, size });

	return (
		<div
			ref={barRef}
			data-comment-ui=""
			style={{ transform: `translate(${left}px, ${top}px)` }}
			className="pointer-events-auto absolute top-0 left-0 flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
		>
			<ToolbarButton
				label={t({ message: "Ask for this to be removed" })}
				onClick={() => onQuick(DELETE_BODY)}
			>
				<Trash2 className="size-4 text-red-500" />
			</ToolbarButton>

			<ToolbarButton
				label={t({ message: "Write a comment" })}
				onClick={onComment}
			>
				<MessageSquare className="size-4 text-amber-500" />
			</ToolbarButton>

			<ToolbarButton
				label={t({ message: "Quick feedback" })}
				active={menuOpen}
				onClick={() => setMenuOpen((open) => !open)}
			>
				<Zap className="size-4 text-amber-500" />
			</ToolbarButton>

			<ToolbarButton
				label={t({ message: "Looks good" })}
				onClick={() => onQuick(APPROVE_BODY)}
			>
				<ThumbsUp className="size-4 text-emerald-500" />
			</ToolbarButton>

			<span className="mx-0.5 h-5 w-px bg-border" />

			<ToolbarButton label={t({ message: "Dismiss" })} onClick={onDismiss}>
				<X className="size-4 text-muted-foreground" />
			</ToolbarButton>

			{menuOpen ? (
				<FastMenu onPick={onQuick} onClose={() => setMenuOpen(false)} />
			) : null}
		</div>
	);
}

function ToolbarButton({
	label,
	active,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={cn(
				"flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent",
				active && "bg-accent",
			)}
		>
			{children}
		</button>
	);
}
