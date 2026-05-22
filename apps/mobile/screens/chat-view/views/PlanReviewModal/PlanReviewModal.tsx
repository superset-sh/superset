import { useState } from "react";
import { View } from "react-native";
import { PlanReviewScreen } from "@/components/PlanReviewScreen";
import { MOCK_PLAN_REVIEW_MARKDOWN } from "../../mock-data";

export type PlanReviewModalProps = {
	className?: string;
	planMarkdown?: string;
	onResolve?: (decision: "approve" | "reject", feedback: string) => void;
	onClose?: () => void;
};

/**
 * UC-PAUSE-03 §A — full-screen plan review modal. The modal owns its chrome
 * (no ChatHeader / Composer underneath). Storybook renders it inside the
 * same flex-1 wrapper so reviewers see the modal in iPhone-shaped space.
 *
 * Uses local `useState` to track the resolving spinner across Approve /
 * Reject so the story is interactive.
 */
export function PlanReviewModal({
	className,
	planMarkdown = MOCK_PLAN_REVIEW_MARKDOWN,
	onResolve,
	onClose,
}: PlanReviewModalProps) {
	const [submitting, setSubmitting] = useState(false);
	const [feedback, setFeedback] = useState("");

	const handleResolve = (decision: "approve" | "reject") => {
		setSubmitting(true);
		onResolve?.(decision, feedback);
		setTimeout(() => setSubmitting(false), 1200);
	};

	return (
		<View className={`flex-1 bg-background ${className ?? ""}`}>
			<PlanReviewScreen
				planMarkdown={planMarkdown}
				feedback={feedback}
				onFeedbackChange={setFeedback}
				onApprove={() => handleResolve("approve")}
				onReject={() => handleResolve("reject")}
				onClose={onClose}
				isSubmitting={submitting}
			/>
		</View>
	);
}
