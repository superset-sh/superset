import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatThread } from "@/components/ChatThread";
import { Composer } from "@/components/Composer";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { cn } from "@/lib/utils";
import type {
	ChatHeaderProps,
	ChatThreadItem,
	ComposerProps,
} from "../../types";

export type ChatViewProps = Omit<ViewProps, "children"> & {
	/** Header props forwarded to ChatHeader. Pass `null` to suppress (modal flows). */
	header?: ChatHeaderProps | null;
	/** Thread items. When undefined and `isLoading` is true, renders LoadingSkeleton. */
	items?: ReadonlyArray<ChatThreadItem>;
	/** When true, replaces thread body with LoadingSkeleton. */
	isLoading?: boolean;
	/** Forwarded to Composer. Pass `null` to suppress (pause-approval overlay). */
	composer?: ComposerProps | null;
	/**
	 * Replaces the thread body entirely (used by pause-approval, error-retry,
	 * subagent, and other states that own the body region).
	 */
	body?: ReactNode;
	/**
	 * Floating UI anchored above the body via absolute positioning — popovers,
	 * scroll-back FAB, pending-action pill. The slot positions itself; this
	 * shell just renders it inside the body container so it stacks correctly.
	 */
	floating?: ReactNode;
	/**
	 * Overlay anchored to the bottom of the screen between body and composer.
	 * Use for popovers (slash-command, model-picker, thinking-level) that
	 * stack above the composer without dimming the body.
	 */
	bottomOverlay?: ReactNode;
	/**
	 * Full-screen layer that occludes the chat (bottom sheet, modal, dialog
	 * backdrops). Rendered last over everything — typically a portal-mounted
	 * organism whose own internals handle positioning + backdrop dimming.
	 */
	overlay?: ReactNode;
};

/**
 * Single composition shell for the chat-view screen — UC-RENDER-01 §A
 * (CANONICAL), UC-COMP-*, UC-PAUSE-01/04, UC-PLATF-03 banner variants.
 *
 * Composes ChatHeader + ChatThread + Composer into the iPhone vertical
 * layout, with explicit slots for floating UI (popovers, FABs, pills) and
 * full-screen overlays (sheets, modals, dialogs). Every chat-view design
 * (e.g. `designs/views/02-chat-view/states/streaming/`) is a configuration
 * of this single shell — never a hand-rolled layout — so the implementation
 * matches the wireframes 1:1.
 *
 * Slot semantics:
 *  - `header`          → top region (safe-area + status row + optional banner)
 *  - `body` / `items`  → middle scrolling region (ChatThread or custom body)
 *  - `floating`        → absolute UI anchored over the body (e.g. scroll-back
 *                        FAB, pending-action pill); positioning is the slot's
 *                        responsibility
 *  - `bottomOverlay`   → popover layer between body and composer
 *                        (slash-command, picker popovers)
 *  - `composer`        → footer region; pass `null` during pause-approval
 *  - `overlay`         → full-screen layer over everything (BottomSheet modal,
 *                        ConfirmationDialog, PlanReviewScreen)
 *
 * No expo-router or theme-context imports — this view is renderable inside
 * Storybook RN under the existing PortalHost + bg-background decorator (see
 * `apps/mobile/.rnstorybook/preview.tsx`).
 */
export function ChatView({
	header,
	items,
	isLoading,
	composer,
	body,
	floating,
	bottomOverlay,
	overlay,
	className,
	...props
}: ChatViewProps) {
	const renderedBody =
		body ??
		(isLoading || items === undefined ? (
			<LoadingSkeleton />
		) : (
			<ChatThread items={items} />
		));

	return (
		<View className={cn("flex-1 bg-background", className)} {...props}>
			{header === null ? null : header ? <ChatHeader {...header} /> : null}
			<View className="flex-1">
				{renderedBody}
				{floating}
			</View>
			{bottomOverlay}
			{composer === null ? null : composer ? <Composer {...composer} /> : null}
			{overlay}
		</View>
	);
}
