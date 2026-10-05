import { Trans } from "@lingui/react/macro";

export function TurnStatusRow({
	message,
	status,
}: {
	status: "failed" | "interrupted";
	message: string | undefined;
}) {
	if (status === "interrupted") {
		return (
			<div className="text-xs text-muted-foreground">
				<Trans>Interrupted</Trans>
			</div>
		);
	}
	return (
		<div className="text-xs text-destructive">
			{message ? (
				<Trans>Turn failed: {message}</Trans>
			) : (
				<Trans>Turn failed</Trans>
			)}
		</div>
	);
}
