import { Trans } from "@lingui/react/macro";
import { CircleAlert } from "lucide-react";

const USAGE_LIMIT_TEXT = /hit your (?:usage )?limit|usage limit reached/i;

/**
 * How a turn ended when it did not finish: a quiet word for an interruption
 * the reader caused, a card for a failure, with the agent's own words under
 * a title that says what kind of failure it was.
 */
export function TurnStatusRow({
	message,
	status,
}: {
	status: "failed" | "interrupted";
	message: string | undefined;
}) {
	if (status === "interrupted") {
		return (
			<div className="text-muted-foreground text-xs">
				<Trans>Interrupted</Trans>
			</div>
		);
	}
	const usageLimit = message !== undefined && USAGE_LIMIT_TEXT.test(message);
	return (
		<div
			className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.06] px-3 py-2 font-sans text-xs"
			data-turn-failed
		>
			<CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
			<div className="min-w-0 flex-1">
				<div className="font-medium text-destructive">
					{usageLimit ? (
						<Trans>Stopped by the usage limit</Trans>
					) : (
						<Trans>Turn failed</Trans>
					)}
				</div>
				{message && (
					<div className="mt-0.5 wrap-anywhere whitespace-pre-wrap font-mono text-[12px] text-foreground/60 leading-5">
						{message}
					</div>
				)}
			</div>
		</div>
	);
}
