import { Trans } from "@lingui/react/macro";

export function LoadingState() {
	return (
		<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
			<Trans id="workspace.filePane.loading">Loading…</Trans>
		</div>
	);
}
