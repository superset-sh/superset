/**
 * Stacks whichever docks are active for a session, above the composer.
 * Order: permission (most blocking) → question → plan → todo. The
 * composer is expected to disable submit while permission/question/plan
 * docks are rendered (see ChatSurface).
 */

import { useChatStore } from "../../../../store";
import { selectDocks } from "../../../../store/dockSelectors";
import { PermissionDock } from "./PermissionDock";
import { PlanDock } from "./PlanDock";
import { QuestionDock } from "./QuestionDock";
import { TodoDock } from "./TodoDock";

export interface DocksStackProps {
	sessionId: string;
	onApprovalRespond?: (
		decision: "approve" | "decline" | "always_allow_category",
	) => void;
	onQuestionRespond?: (answer: string) => void;
	onPlanRespond?: (
		response:
			| { action: "approved" }
			| { action: "rejected"; feedback?: string },
	) => void;
	approvalSubmitting?: boolean;
	questionSubmitting?: boolean;
	planSubmitting?: boolean;
}

export function DocksStack({
	sessionId,
	onApprovalRespond,
	onQuestionRespond,
	onPlanRespond,
	approvalSubmitting,
	questionSubmitting,
	planSubmitting,
}: DocksStackProps) {
	const docks = useChatStore((s) => selectDocks(s, sessionId));

	if (!docks.approval && !docks.question && !docks.plan && docks.todos.length === 0) {
		return null;
	}

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-2">
			{docks.approval && onApprovalRespond && (
				<PermissionDock
					request={docks.approval}
					onRespond={onApprovalRespond}
					submitting={approvalSubmitting}
				/>
			)}
			{docks.question && onQuestionRespond && (
				<QuestionDock
					request={docks.question}
					onRespond={onQuestionRespond}
					submitting={questionSubmitting}
				/>
			)}
			{docks.plan && onPlanRespond && (
				<PlanDock
					request={docks.plan}
					onRespond={onPlanRespond}
					submitting={planSubmitting}
				/>
			)}
			<TodoDock todos={docks.todos} />
		</div>
	);
}
