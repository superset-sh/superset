import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type {
	ApprovalRequest,
	Decision,
	Item,
	ToolCall,
} from "@superset/chat/protocol";
import { i18n } from "@superset/i18n";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { ShieldQuestion, SquareTerminal } from "lucide-react";
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
	target,
}: {
	item: ApprovalRequest;
	onRespond: (approvalId: string, decision: Decision) => void;
	target?: Item | undefined;
}) {
	const pending = item.status === "pending";
	const options = item.options ?? [];
	const command =
		target?.kind === "tool_call" && (target as ToolCall).toolKind === "execute";
	const Icon = command ? SquareTerminal : ShieldQuestion;
	return (
		<div
			className={cn(
				"flex flex-col gap-2.5 rounded-xl border",
				pending ? "p-3" : "px-3 py-2",
				pending
					? "border-warning/30 bg-warning/[0.04]"
					: "border-border/60 bg-muted/20",
			)}
		>
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<Icon
					className={cn(
						"size-4 shrink-0",
						pending ? "text-warning" : "text-muted-foreground",
					)}
				/>
				{pending ? (
					<span className="font-medium">
						{command ? (
							<Trans>Run this command?</Trans>
						) : (
							<Trans>Allow this action?</Trans>
						)}
					</span>
				) : (
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-muted-foreground",
							command && "font-mono text-[12.5px]",
						)}
					>
						{item.title}
					</span>
				)}
				{item.status === "stale" && (
					<Badge className="ml-auto" variant="outline">
						<Trans>Expired</Trans>
					</Badge>
				)}
				{item.status === "answered" && (
					<Badge className="ml-auto" variant="secondary">
						{decisionLabel(item.decision, options)}
					</Badge>
				)}
			</div>
			{pending &&
				(command ? (
					<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 px-3 py-2 font-mono text-[12.5px] leading-relaxed">
						{item.title}
					</pre>
				) : (
					<p className="text-muted-foreground text-sm">{item.title}</p>
				))}
			{pending && item.detail && (
				<ToolContentList itemId={item.id} items={item.detail} />
			)}
			{pending &&
				(options.length > 0 ? (
					<OptionButtons item={{ ...item, options }} onRespond={onRespond} />
				) : (
					<div className="flex items-center justify-end gap-2">
						<Button
							onClick={() => onRespond(item.id, { type: "decline" })}
							size="sm"
							variant="outline"
						>
							<Trans>Deny</Trans>
						</Button>
						<Button
							onClick={() => onRespond(item.id, { type: "accept_for_session" })}
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
				))}
		</div>
	);
}
