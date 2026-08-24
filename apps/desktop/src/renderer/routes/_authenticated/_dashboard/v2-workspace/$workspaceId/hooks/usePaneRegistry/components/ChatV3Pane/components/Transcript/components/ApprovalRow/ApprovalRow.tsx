import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ToolContentList } from "../ToolContentList";

function decisionLabel(decision: Decision | undefined): string {
	if (!decision) return "Answered";
	switch (decision.type) {
		case "accept":
			return "Allowed";
		case "accept_for_session":
			return "Allowed for session";
		case "decline":
			return "Denied";
		case "cancel":
			return "Canceled";
		case "option":
			return decision.optionId;
		default:
			return "Answered";
	}
}

export function ApprovalRow({
	item,
	onRespond,
}: {
	item: ApprovalRequest;
	onRespond: (approvalId: string, decision: Decision) => void;
}) {
	const pending = item.status === "pending";
	return (
		<div
			className={
				pending
					? "flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/5 p-3"
					: "flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
			}
		>
			<div className="flex items-center gap-2">
				<span className="text-sm font-medium">{item.title}</span>
				{item.status === "stale" && <Badge variant="outline">Expired</Badge>}
				{item.status === "answered" && (
					<Badge variant="secondary">{decisionLabel(item.decision)}</Badge>
				)}
			</div>
			{item.detail && <ToolContentList itemId={item.id} items={item.detail} />}
			{pending &&
				(item.options?.length ? (
					<div className="flex flex-wrap gap-2">
						{item.options.map((option) => (
							<Button
								key={option.optionId}
								onClick={() =>
									onRespond(item.id, {
										type: "option",
										optionId: option.optionId,
									})
								}
								size="sm"
								variant="outline"
							>
								{option.label}
							</Button>
						))}
					</div>
				) : (
					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() => onRespond(item.id, { type: "accept" })}
							size="sm"
						>
							Allow
						</Button>
						<Button
							onClick={() => onRespond(item.id, { type: "accept_for_session" })}
							size="sm"
							variant="outline"
						>
							Allow for session
						</Button>
						<Button
							onClick={() => onRespond(item.id, { type: "decline" })}
							size="sm"
							variant="outline"
						>
							Deny
						</Button>
					</div>
				))}
		</div>
	);
}
