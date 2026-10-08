import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { i18n } from "@superset/i18n";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ToolContentList } from "../ToolContentList";
import { OptionButtons } from "./components/OptionButtons";
import type { ApprovalOption } from "./utils/optionRole";

const DECISION_ANSWERED = msg({
	message: "Answered",
});

function decisionLabel(
	decision: Decision | undefined,
	options: readonly ApprovalOption[],
): string {
	if (!decision) return i18n._(DECISION_ANSWERED);
	switch (decision.type) {
		case "accept":
			return i18n._(msg({ message: "Allowed" }));
		case "accept_for_session":
			return i18n._(
				msg({
					message: "Allowed for session",
				}),
			);
		case "decline":
			return i18n._(msg({ message: "Denied" }));
		case "cancel":
			return i18n._(msg({ message: "Canceled" }));
		case "option":
			return (
				options.find((option) => option.optionId === decision.optionId)
					?.label ?? decision.optionId
			);
		default:
			return i18n._(DECISION_ANSWERED);
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
	const options = item.options ?? [];
	return (
		<div
			className={
				pending
					? "flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/5 p-3"
					: "flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
			}
		>
			<div className="flex items-center gap-2">
				{pending && (
					<span
						aria-hidden
						className="size-2 shrink-0 rounded-full bg-warning ring-[3px] ring-warning/20"
					/>
				)}
				<span className="text-sm font-medium">{item.title}</span>
				{item.status === "stale" && (
					<Badge variant="outline">
						<Trans>Expired</Trans>
					</Badge>
				)}
				{item.status === "answered" && (
					<Badge variant="secondary">
						{decisionLabel(item.decision, options)}
					</Badge>
				)}
			</div>
			{item.detail && <ToolContentList itemId={item.id} items={item.detail} />}
			{pending &&
				(options.length > 0 ? (
					<OptionButtons item={{ ...item, options }} onRespond={onRespond} />
				) : (
					<div className="flex flex-wrap items-center gap-2">
						<Button
							onClick={() => onRespond(item.id, { type: "decline" })}
							size="sm"
							variant="ghost"
						>
							<Trans>Deny</Trans>
						</Button>
						<div className="flex flex-1 flex-wrap justify-end gap-2">
							<Button
								onClick={() =>
									onRespond(item.id, { type: "accept_for_session" })
								}
								size="sm"
								variant="outline"
							>
								<Trans>Allow for session</Trans>
							</Button>
							<Button
								onClick={() => onRespond(item.id, { type: "accept" })}
								size="sm"
							>
								<Trans>Allow</Trans>
							</Button>
						</div>
					</div>
				))}
		</div>
	);
}
