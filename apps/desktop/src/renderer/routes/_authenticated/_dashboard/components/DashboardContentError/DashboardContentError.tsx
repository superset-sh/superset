import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";

/**
 * Content-pane error state for the dashboard. Rendered by the CatchBoundary
 * around the dashboard Outlet so a crashing route unmounts only the content
 * area — the sidebar, terminals, and window chrome stay alive (SUPER-1814
 * presented as "the whole app restarts" because errors used to bubble to the
 * root boundary). The boundary resets on navigation, so the sidebar and the
 * Go-home link both recover it.
 */
export function DashboardContentError({ error }: ErrorComponentProps) {
	const { t } = useLingui();
	const message =
		error instanceof Error
			? error.message
			: String(
					error ??
						t({
							message: "Unknown error",
						}),
				);

	useEffect(() => {
		console.error("[dashboard] Content route error caught:", error);
		void import("@sentry/electron/renderer")
			.then((Sentry) => Sentry.captureException(error))
			.catch((reportError) => {
				// Don't let a telemetry failure vanish silently — the fallback UI
				// still renders, but we want the reporting gap to be observable.
				console.error(
					"[dashboard] failed to report content error to Sentry",
					reportError,
				);
			});
	}, [error]);

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background px-8">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
				<HiExclamationTriangle className="h-6 w-6 text-destructive" />
			</div>
			<div className="flex flex-col items-center gap-1 text-center">
				<h2 className="text-base font-semibold">
					<Trans>This view hit an error</Trans>
				</h2>
				<p className="max-w-md text-sm text-muted-foreground select-text cursor-text break-words">
					{message}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" asChild>
					<Link to="/">
						<Trans>Go home</Trans>
					</Link>
				</Button>
				<Button size="sm" onClick={() => window.location.reload()}>
					<Trans>Reload app</Trans>
				</Button>
			</div>
		</div>
	);
}
