import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@superset/ui/ai-elements/message";
import { Button } from "@superset/ui/button";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useId, useRef, useState } from "react";

type PendingPlanApproval = UseMastraChatDisplayReturn["pendingPlanApproval"];

interface PendingPlanApprovalMessageProps {
	planApproval: PendingPlanApproval;
	isSubmitting: boolean;
	onRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
}

export function PendingPlanApprovalMessage({
	planApproval,
	isSubmitting,
	onRespond,
}: PendingPlanApprovalMessageProps) {
	const [feedback, setFeedback] = useState("");
	const [selectedAction, setSelectedAction] = useState<
		"approved" | "rejected" | null
	>(null);
	const [renderMarkdown, setRenderMarkdown] = useState(false);
	const previousPlanIdRef = useRef<string | null>(null);
	const markdownToggleId = useId();

	useEffect(() => {
		const currentPlanId = planApproval?.planId ?? null;
		if (previousPlanIdRef.current === currentPlanId) return;
		previousPlanIdRef.current = currentPlanId;
		setFeedback("");
		setSelectedAction(null);
		setRenderMarkdown(false);
	}, [planApproval]);

	if (!planApproval) return null;

	const title = planApproval?.title?.trim() || "Implementation plan";
	const planBody =
		planApproval?.plan?.trim() || "No plan details were provided.";
	const canRespond = Boolean(planApproval?.planId);
	const feedbackTrimmed = feedback.trim();

	return (
		<Message from="assistant">
			<MessageContent>
				<div className="w-full max-w-none space-y-3 rounded-xl border bg-card/95 p-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="text-sm text-foreground">{title}</div>
						<label
							htmlFor={markdownToggleId}
							className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
						>
							<Switch
								id={markdownToggleId}
								checked={renderMarkdown}
								onCheckedChange={setRenderMarkdown}
								disabled={isSubmitting}
							/>
							Render markdown
						</label>
					</div>
					<div className="rounded-md border bg-muted/20 p-3">
						{renderMarkdown ? (
							<div className="max-h-72 overflow-auto">
								<MessageResponse
									animated={false}
									isAnimating={false}
									mermaid={{
										config: {
											theme: "default",
										},
									}}
								>
									{planBody}
								</MessageResponse>
							</div>
						) : (
							<pre className="max-h-72 overflow-auto text-sm whitespace-pre-wrap break-words">
								{planBody}
							</pre>
						)}
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
					<div className="flex flex-wrap items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className={
								selectedAction === "rejected"
									? "border-destructive text-destructive"
									: ""
							}
							disabled={isSubmitting || !canRespond}
							onClick={() => {
								setSelectedAction("rejected");
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
							className={
								selectedAction === "approved"
									? "border-primary bg-primary/10 text-primary"
									: ""
							}
							disabled={isSubmitting || !canRespond}
							onClick={() => {
								setSelectedAction("approved");
								void onRespond({
									action: "approved",
									...(feedbackTrimmed ? { feedback: feedbackTrimmed } : {}),
								});
							}}
						>
							Approve plan
						</Button>
					</div>
				</div>
			</MessageContent>
		</Message>
	);
}
