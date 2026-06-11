import { View, type ViewProps } from "react-native";
import {
	ApprovalFooter,
	type ApprovalFooterResolvingAction,
} from "@/components/ApprovalFooter";
import {
	PendingApprovalCard,
	type PendingApprovalCardState,
} from "@/components/PendingApprovalCard";
import { cn } from "@/lib/utils";

export type PauseApprovalOverlayProps = ViewProps & {
	title: string;
	subtitle?: string;
	argsPreview?: string;
	alwaysAllowable?: boolean;
	cardState?: PendingApprovalCardState;
	queueIndex?: number;
	queueCount?: number;
	resolving?: ApprovalFooterResolvingAction;
	onApprove?: () => void;
	onDecline?: () => void;
	onAlways?: () => void;
	/** When provided, renders these additional thread items above the card (e.g. assistant body explaining the request). */
	header?: React.ReactNode;
};

/**
 * Inline approval card + sticky footer (UC-PAUSE-01). Renders the card in the
 * thread flow and the action footer pinned to the bottom safe area. The host
 * Composer organism MUST be set to `state="hidden"` while this overlay is
 * visible so the footer occupies the input region.
 *
 * Composes the PendingApprovalCard + ApprovalFooter molecules. State sync
 * (resolving on Approve / Decline / Always) is the caller's responsibility —
 * pass the `resolving` and `cardState` props together so the visual feedback
 * stays consistent.
 */
export function PauseApprovalOverlay({
	title,
	subtitle,
	argsPreview,
	alwaysAllowable,
	cardState,
	queueIndex,
	queueCount,
	resolving,
	onApprove,
	onDecline,
	onAlways,
	header,
	className,
	...props
}: PauseApprovalOverlayProps) {
	return (
		<View className={cn("flex-1", className)} {...props}>
			<View className="flex-1 px-4 pt-2 pb-3 gap-3">
				{header}
				<PendingApprovalCard
					title={title}
					subtitle={subtitle}
					argsPreview={argsPreview}
					alwaysAllowable={alwaysAllowable}
					state={resolving ? "resolving" : (cardState ?? "pending")}
				/>
			</View>
			<ApprovalFooter
				queueIndex={queueIndex}
				queueCount={queueCount}
				onApprove={onApprove}
				onDecline={onDecline}
				onAlways={onAlways}
				resolving={resolving}
			/>
		</View>
	);
}
