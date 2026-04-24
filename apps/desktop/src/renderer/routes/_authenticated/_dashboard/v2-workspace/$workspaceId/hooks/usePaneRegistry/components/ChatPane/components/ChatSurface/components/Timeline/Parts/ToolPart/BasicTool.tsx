/**
 * BasicTool — the shared collapsible card every tool renderer sits
 * inside. Ported from OpenCode's basic-tool.tsx
 * (temp/opencode/packages/ui/src/components/basic-tool.tsx) and adapted
 * for Radix Collapsible + Tailwind.
 *
 * Visual structure:
 *   ┌─ trigger row (clickable) ─────────────────────────────────┐
 *   │  [icon] [title(shimmer if pending)] [subtitle] [args]  ▸  │
 *   └───────────────────────────────────────────────────────────┘
 *      collapsible content (animates height in/out)
 *
 * Defer: when `defer` is true, children are not mounted until the
 * accordion is opened and one animation frame has passed. Essential
 * for sessions with many tool calls so we don't bloat DOM upfront.
 *
 * Plan reference: 20260421-v2-chat-opencode-ui-components.md §Tier 1.
 */

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import "./BasicTool.css";
import { TextShimmer } from "./TextShimmer";

export interface BasicToolTriggerTitle {
	title: string;
	subtitle?: string;
	args?: string[];
	action?: ReactNode;
}

export type BasicToolStatus = "pending" | "running" | "completed" | "error";

export interface BasicToolProps {
	icon: LucideIcon;
	trigger: BasicToolTriggerTitle | ReactNode;
	status?: BasicToolStatus;
	children?: ReactNode;
	/** Collapse the whole card when children should not show (tool w/o detail). */
	hideDetails?: boolean;
	defaultOpen?: boolean;
	/** Force-open (used for errors). */
	forceOpen?: boolean;
	/** Defer child mount until opened + rAF. */
	defer?: boolean;
	/** Prevent close while the card is in a "running" visual state. */
	locked?: boolean;
	onSubtitleClick?: () => void;
}

function isStructuredTrigger(
	v: BasicToolProps["trigger"],
): v is BasicToolTriggerTitle {
	return !!v && typeof v === "object" && "title" in (v as object);
}

export function BasicTool(props: BasicToolProps) {
	const pending = props.status === "pending" || props.status === "running";
	const error = props.status === "error";

	const [open, setOpen] = useState(
		props.forceOpen ?? props.defaultOpen ?? error,
	);
	const [ready, setReady] = useState(open);

	useEffect(() => {
		if (props.forceOpen) setOpen(true);
	}, [props.forceOpen]);

	// Deferred mount of children: wait one frame after open so the
	// collapsible height animation can kick off before we pay the cost
	// of rendering tool output.
	useEffect(() => {
		if (!props.defer) {
			setReady(true);
			return;
		}
		if (!open) {
			setReady(false);
			return;
		}
		const frame = requestAnimationFrame(() => setReady(true));
		return () => cancelAnimationFrame(frame);
	}, [props.defer, open]);

	const handleOpenChange = (v: boolean) => {
		if (pending) return;
		if (props.locked && !v) return;
		setOpen(v);
	};

	const Icon = props.icon;

	const triggerContent = (
		<div
			data-component="tool-trigger"
			data-hide-details={props.hideDetails ? "true" : undefined}
			className="flex w-full items-center gap-2 text-left"
		>
			<div
				data-slot="basic-tool-tool-trigger-content"
				className="flex min-w-0 flex-1 items-center gap-2"
			>
				<span
					data-slot="basic-tool-tool-indicator"
					className="text-muted-foreground flex size-4 shrink-0 items-center justify-center"
				>
					<Icon className="size-4" />
				</span>
				<div
					data-slot="basic-tool-tool-info"
					className="flex min-w-0 flex-1 items-baseline gap-2 text-sm"
				>
					{isStructuredTrigger(props.trigger) ? (
						<StructuredTrigger
							title={props.trigger}
							pending={pending}
							onSubtitleClick={props.onSubtitleClick}
						/>
					) : (
						(props.trigger as ReactNode)
					)}
				</div>
			</div>
			{!props.hideDetails && !props.locked && !pending && (
				<ChevronDown
					data-slot="basic-tool-chevron"
					className="text-muted-foreground size-3.5 shrink-0"
					aria-hidden
				/>
			)}
		</div>
	);

	return (
		<Collapsible
			open={open}
			onOpenChange={handleOpenChange}
			className="border-border my-2 rounded-md border"
		>
			<CollapsibleTrigger
				data-component="basic-tool-trigger"
				data-state={open ? "open" : "closed"}
				className="hover:bg-muted/30 flex w-full items-center px-3 py-2 transition-colors"
			>
				{triggerContent}
			</CollapsibleTrigger>
			{!props.hideDetails && props.children && (
				<CollapsibleContent data-slot="basic-tool-content">
					<div className="border-border border-t px-3 py-2 text-xs">
						{(!props.defer || ready) && props.children}
					</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}

function StructuredTrigger({
	title,
	pending,
	onSubtitleClick,
}: {
	title: BasicToolTriggerTitle;
	pending: boolean;
	onSubtitleClick?: () => void;
}) {
	const collapseRef = useRef<HTMLDivElement>(null);
	return (
		<div
			ref={collapseRef}
			data-slot="basic-tool-tool-info-main"
			className="flex min-w-0 items-baseline gap-2 overflow-hidden"
		>
			<span
				data-slot="basic-tool-tool-title"
				className="text-foreground shrink-0 text-sm font-medium"
			>
				<TextShimmer text={title.title} active={pending} />
			</span>
			{!pending && title.subtitle && (
				<button
					type="button"
					data-slot="basic-tool-tool-subtitle"
					onClick={
						onSubtitleClick
							? (e) => {
									e.stopPropagation();
									onSubtitleClick();
								}
							: undefined
					}
					className={`text-muted-foreground min-w-0 flex-shrink truncate text-left text-sm font-normal ${
						onSubtitleClick ? "hover:text-foreground cursor-pointer" : "cursor-default"
					}`}
				>
					{title.subtitle}
				</button>
			)}
			{!pending &&
				title.args?.map((arg) => (
					<span
						key={arg}
						data-slot="basic-tool-tool-arg"
						className="text-muted-foreground font-mono text-xs"
					>
						{arg}
					</span>
				))}
			{!pending && title.action && (
				<span data-slot="basic-tool-tool-action" className="ml-auto shrink-0">
					{title.action}
				</span>
			)}
		</div>
	);
}
