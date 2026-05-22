import { useState } from "react";
import { PauseApprovalOverlay } from "@/components/PauseApprovalOverlay";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import { MOCK_HEADER } from "../../mock-data";
import type {
	ApprovalDecision,
	ApprovalFooterResolvingAction,
} from "../../types";

export type ChatViewPauseApprovalProps = Pick<ChatViewProps, "className"> & {
	queueCount?: number;
	queueIndex?: number;
	onDecision?: (decision: ApprovalDecision) => void;
};

const RESOLVING_BY_DECISION: Record<
	ApprovalDecision,
	ApprovalFooterResolvingAction
> = {
	approve: "approve",
	decline: "decline",
	always: "always",
};

/**
 * UC-PAUSE-01 §A — inline pending-approval card + sticky thumb-docked
 * Approve/Decline/Always-allow footer. The composer is suppressed so the
 * footer occupies the input region (a hard requirement of the wireframe).
 *
 * Storybook hook: useState drives `resolving` from null → action so reviewers
 * can tap each button and see the dim + spinner transition.
 */
export function ChatViewPauseApproval({
	queueCount = 1,
	queueIndex = 1,
	onDecision,
	className,
}: ChatViewPauseApprovalProps) {
	const [resolving, setResolving] = useState<
		ApprovalFooterResolvingAction | undefined
	>(undefined);

	const handleDecision = (decision: ApprovalDecision) => {
		setResolving(RESOLVING_BY_DECISION[decision]);
		onDecision?.(decision);
		setTimeout(() => setResolving(undefined), 1200);
	};

	return (
		<ChatView
			className={className}
			header={{
				...MOCK_HEADER,
				status: "paused",
				statusLabel: "Awaiting approval",
			}}
			body={
				<PauseApprovalOverlay
					title="Edit packages/billing/router.ts"
					subtitle="Replace REST fetch with tRPC mutation"
					argsPreview={'edit_file({ path: "packages/billing/router.ts", … })'}
					alwaysAllowable
					queueCount={queueCount}
					queueIndex={queueIndex}
					resolving={resolving}
					onApprove={() => handleDecision("approve")}
					onDecline={() => handleDecision("decline")}
					onAlways={() => handleDecision("always")}
				/>
			}
			composer={null}
		/>
	);
}
