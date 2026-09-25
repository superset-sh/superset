import { Trans } from "@lingui/react/macro";

export function LoadingState() {
	return (
		<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
			<Trans>Loading…</Trans>
		</div>
	);
}
