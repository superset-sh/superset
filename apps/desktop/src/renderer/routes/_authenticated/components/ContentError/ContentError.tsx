import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { failureDiagnostic } from "renderer/lib/failure-diagnostic/failure-diagnostic";

export function ContentError({ error }: ErrorComponentProps) {
	const { t } = useLingui();
	const message =
		error == null ? t({ message: "Unknown error" }) : failureDiagnostic(error);

	useEffect(() => {
		console.error("[content] Content route error caught:", error);
		void import("@sentry/electron/renderer")
			.then((Sentry) => Sentry.captureException(error))
			.catch((reportError) => {
				// Don't let a telemetry failure vanish silently — the fallback UI
				// still renders, but we want the reporting gap to be observable.
				console.error(
					"[content] failed to report content error to Sentry",
					reportError,
				);
			});
	}, [error]);

	return (
		<div className="flex h-full min-h-0 min-w-0 w-full overflow-auto bg-background p-4">
			<div className="m-auto flex w-full min-w-0 max-w-md shrink-0 flex-col items-center gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
					<HiExclamationTriangle className="h-6 w-6 text-destructive" />
				</div>
				<div className="w-full text-center">
					<h2 className="text-base font-semibold">
						<Trans>This view hit an error</Trans>
					</h2>
				</div>
				<div className="flex flex-wrap items-center justify-center gap-2">
					<Button variant="outline" size="sm" asChild>
						<Link to="/">
							<Trans>Go home</Trans>
						</Link>
					</Button>
					<Button size="sm" onClick={() => window.location.reload()}>
						<Trans>Reload app</Trans>
					</Button>
				</div>
				<p className="max-h-40 w-full shrink-0 overflow-auto text-sm text-muted-foreground select-text cursor-text break-words">
					{message}
				</p>
			</div>
		</div>
	);
}
