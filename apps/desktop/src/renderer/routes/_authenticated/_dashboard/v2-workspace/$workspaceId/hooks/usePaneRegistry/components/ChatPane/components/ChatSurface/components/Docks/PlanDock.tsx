/**
 * PlanDock — shows the agent's plan markdown with approve/reject
 * actions. Plans are non-blocking by design (user can continue
 * reading while deciding), which matches t3code's posture.
 */

import type { PlanApprovalRequest } from "@superset/chat/shared";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { Markdown } from "../Timeline/Parts/Markdown";
import { DockFrame } from "./DockFrame";

export interface PlanDockProps {
	request: PlanApprovalRequest;
	submitting?: boolean;
	onRespond: (
		response:
			| { action: "approved" }
			| { action: "rejected"; feedback?: string },
	) => void;
}

export function PlanDock({
	request,
	submitting = false,
	onRespond,
}: PlanDockProps) {
	const [feedback, setFeedback] = useState("");
	const [showFeedback, setShowFeedback] = useState(false);

	return (
		<DockFrame tone="blue" label="Plan awaiting approval">
			<div className="max-h-64 overflow-y-auto">
				<Markdown source={request.markdown} />
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					disabled={submitting}
					onClick={() => onRespond({ action: "approved" })}
				>
					Approve plan
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={submitting}
					onClick={() => setShowFeedback((v) => !v)}
				>
					{showFeedback ? "Cancel" : "Reject with feedback"}
				</Button>
			</div>
			{showFeedback && (
				<form
					className="flex items-center gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						onRespond({
							action: "rejected",
							feedback: feedback.trim() || undefined,
						});
						setFeedback("");
						setShowFeedback(false);
					}}
				>
					<input
						className="border-border bg-background flex-1 rounded-md border px-2 py-1 text-sm"
						placeholder="Why reject? (optional)"
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						disabled={submitting}
					/>
					<Button size="sm" type="submit" variant="destructive" disabled={submitting}>
						Reject
					</Button>
				</form>
			)}
		</DockFrame>
	);
}
