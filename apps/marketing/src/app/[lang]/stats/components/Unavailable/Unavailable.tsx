import { Trans } from "@lingui/react/macro";

export function Unavailable() {
	return (
		<div className="border border-border p-12 text-center">
			<p className="text-sm text-muted-foreground">
				<Trans>Stats are unavailable right now.</Trans>
			</p>
		</div>
	);
}
