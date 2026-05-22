/**
 * Chat-view domain types — mirrors the contracts described in
 * plans/chat-mobile-plan/{01-scope, 05-uc-comp, 06-uc-render, 07-uc-pause,
 * 08-uc-platf}.md and the host runtime `ChatThinkingLevel` /
 * `ApprovalDecision` shapes from `packages/host-service/src/runtime/chat/`.
 *
 * These re-exports give view stories one import surface for the prop types
 * shared across organisms (ChatHeader · ChatThread · Composer · overlays).
 * No new types are invented here — every type is the same one the underlying
 * component / molecule already exposes, just collected for ergonomics.
 */

export type { ApprovalFooterResolvingAction } from "@/components/ApprovalFooter";
export type { BannerProps, BannerVariant } from "@/components/Banner";
export type {
	ChatHeaderProps,
	ChatHeaderStatus,
} from "@/components/ChatHeader";
export type {
	ChatThreadItem,
	ChatThreadProps,
} from "@/components/ChatThread";
export type { CollapsedBlockKind } from "@/components/CollapsedBlock";
export type { ComposerProps, ComposerState } from "@/components/Composer";
export type {
	PermissionMode,
	ThinkingLevel,
} from "@/components/ComposerSettingsButton";
export type { PauseApprovalOverlayProps } from "@/components/PauseApprovalOverlay";
export type {
	PendingActionPillKind,
	PendingActionPillProps,
} from "@/components/PendingActionPill";
export type { PendingApprovalCardState } from "@/components/PendingApprovalCard";
export type {
	PickerPopoverItem,
	PickerPopoverProps,
	PickerPopoverSection,
} from "@/components/PickerPopover";
export type {
	SlashCommand,
	SlashCommandPopoverProps,
} from "@/components/SlashCommandPopover";
export type { ToolCallStatus } from "@/components/ToolCallCard";

/**
 * UC-PAUSE-01 approval decision passed to `chat.respondToApproval`
 * (see plans/chat-mobile-plan/11-technical-requirements/02-api-design.md).
 */
export type ApprovalDecision = "approve" | "decline" | "always";

/**
 * UC-RENDER-01 / UC-COMP-03 turn status — drives whether the streaming cursor
 * is visible, whether the composer Stop button is shown, etc.
 */
export type TurnStatus = "idle" | "streaming" | "stopped" | "completed";
