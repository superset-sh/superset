import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useRef, useState } from "react";

interface PendingPlanApproval {
	planId: string;
	title?: string;
	plan: string;
}

interface PlanApprovalDialogProps {
	planApproval: PendingPlanApproval | null;
	isSubmitting: boolean;
	onRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
}

export function PlanApprovalDialog({
	planApproval,
	isSubmitting,
	onRespond,
}: PlanApprovalDialogProps) {
	const [feedback, setFeedback] = useState("");
	const previousPlanIdRef = useRef<string | null>(null);
	const open = Boolean(planApproval);
	const title = planApproval?.title?.trim() || "Implementation plan";
	const planBody =
		planApproval?.plan?.trim() || "No plan details were provided.";
	const canRespond = Boolean(planApproval?.planId);
	const feedbackTrimmed = feedback.trim();

	useEffect(() => {
		const currentPlanId = planApproval?.planId ?? null;
		if (previousPlanIdRef.current === currentPlanId) return;
		previousPlanIdRef.current = currentPlanId;
		setFeedback("");
	}, [planApproval]);

	return (
		<Dialog modal open={open}>
			<DialogContent
				showCloseButton={false}
				className="max-w-2xl"
				onEscapeKeyDown={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Plan approval required</DialogTitle>
					<DialogDescription>{title}</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border bg-muted/20 p-3">
					<pre className="max-h-72 overflow-auto text-sm whitespace-pre-wrap break-words">
						{planBody}
					</pre>
				</div>

				<div className="space-y-2">
					<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
						Feedback (optional)
					</div>
					<Textarea
						value={feedback}
						onChange={(event) => setFeedback(event.target.value)}
						placeholder="Add feedback for revisions..."
						disabled={isSubmitting || !canRespond}
						rows={4}
					/>
				</div>

				<DialogFooter className="justify-end">
					<Button
						type="button"
						variant="outline"
						disabled={isSubmitting || !canRespond}
						onClick={() => {
							void onRespond({
								action: "rejected",
								...(feedbackTrimmed ? { feedback: feedbackTrimmed } : {}),
							});
						}}
					>
						Request changes
					</Button>
					<Button
						type="button"
						disabled={isSubmitting || !canRespond}
						onClick={() => {
							void onRespond({
								action: "approved",
								...(feedbackTrimmed ? { feedback: feedbackTrimmed } : {}),
							});
						}}
					>
						Approve plan
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
