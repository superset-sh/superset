import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import { stringifyCompact, truncate } from "../../utils/active-tools";

interface PendingApprovalState {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

interface PendingQuestionOption {
	label: string;
	description?: string;
}

interface PendingQuestionState {
	questionId: string;
	question: string;
	options?: PendingQuestionOption[];
}

interface PendingPlanApprovalState {
	planId: string;
	title?: string;
	plan: string;
}

interface McpActionPanelsProps {
	pendingApproval: PendingApprovalState | null | undefined;
	pendingQuestion: PendingQuestionState | null | undefined;
	pendingPlanApproval: PendingPlanApprovalState | null | undefined;
	isApprovalPending: boolean;
	isQuestionPending: boolean;
	isPlanPending: boolean;
	questionDraft: string;
	planFeedback: string;
	onQuestionDraftChange: (value: string) => void;
	onPlanFeedbackChange: (value: string) => void;
	onApprove: () => void;
	onDeny: () => void;
	onSubmitQuestion: (answer: string) => void;
	onAcceptPlan: () => void;
	onRejectPlan: () => void;
	onRevisePlan: () => void;
}

export function McpActionPanels({
	pendingApproval,
	pendingQuestion,
	pendingPlanApproval,
	isApprovalPending,
	isQuestionPending,
	isPlanPending,
	questionDraft,
	planFeedback,
	onQuestionDraftChange,
	onPlanFeedbackChange,
	onApprove,
	onDeny,
	onSubmitQuestion,
	onAcceptPlan,
	onRejectPlan,
	onRevisePlan,
}: McpActionPanelsProps) {
	if (!pendingApproval && !pendingQuestion && !pendingPlanApproval) {
		return null;
	}

	return (
		<div className="mx-auto flex w-full max-w-[680px] flex-col gap-2 px-4 pb-2">
			{pendingApproval && (
				<div className="rounded-md border border-border bg-muted/20 px-3 py-2">
					<div className="text-xs font-medium text-foreground">
						Tool approval required
					</div>
					<div className="mt-1 text-xs text-muted-foreground">
						{pendingApproval.toolName}
					</div>
					<div className="mt-2 rounded border border-border/60 bg-background/80 px-2 py-1 font-mono text-[11px] text-muted-foreground">
						{truncate(stringifyCompact(pendingApproval.args), 260)}
					</div>
					<div className="mt-2 flex items-center gap-2">
						<Button size="sm" onClick={onApprove} disabled={isApprovalPending}>
							Approve
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={onDeny}
							disabled={isApprovalPending}
						>
							Deny
						</Button>
					</div>
				</div>
			)}

			{pendingQuestion && (
				<div className="rounded-md border border-border bg-muted/20 px-3 py-2">
					<div className="text-xs font-medium text-foreground">
						Action required
					</div>
					<div className="mt-1 text-sm text-foreground">
						{pendingQuestion.question}
					</div>
					{pendingQuestion.options && pendingQuestion.options.length > 0 && (
						<div className="mt-2 flex flex-wrap gap-2">
							{pendingQuestion.options.map((option) => (
								<Button
									key={option.label}
									size="sm"
									variant="outline"
									disabled={isQuestionPending}
									onClick={() => onSubmitQuestion(option.label)}
								>
									{option.label}
								</Button>
							))}
						</div>
					)}
					<div className="mt-2 flex items-center gap-2">
						<Input
							value={questionDraft}
							onChange={(event) => onQuestionDraftChange(event.target.value)}
							placeholder="Type your answer"
							disabled={isQuestionPending}
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								onSubmitQuestion(questionDraft);
							}}
						/>
						<Button
							size="sm"
							onClick={() => onSubmitQuestion(questionDraft)}
							disabled={isQuestionPending || questionDraft.trim().length === 0}
						>
							Send
						</Button>
					</div>
				</div>
			)}

			{pendingPlanApproval && (
				<div className="rounded-md border border-border bg-muted/20 px-3 py-2">
					<div className="text-xs font-medium text-foreground">
						Plan approval required
					</div>
					{pendingPlanApproval.title && (
						<div className="mt-1 text-sm text-foreground">
							{pendingPlanApproval.title}
						</div>
					)}
					<div className="mt-2 whitespace-pre-wrap rounded border border-border/60 bg-background/80 px-2 py-1 text-xs text-muted-foreground">
						{pendingPlanApproval.plan}
					</div>
					<Textarea
						className="mt-2 min-h-16"
						value={planFeedback}
						onChange={(event) => onPlanFeedbackChange(event.target.value)}
						placeholder="Optional feedback"
						disabled={isPlanPending}
					/>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<Button size="sm" onClick={onAcceptPlan} disabled={isPlanPending}>
							Accept
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={onRejectPlan}
							disabled={isPlanPending}
						>
							Reject
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onClick={onRevisePlan}
							disabled={isPlanPending || planFeedback.trim().length === 0}
						>
							Request Changes
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
