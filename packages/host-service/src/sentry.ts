import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(options: { organizationId?: string }): void {
	if (initialized) return;
	const dsn = process.env.HOST_SERVICE_SENTRY_DSN;
	if (!dsn) return;
	Sentry.init({
		dsn,
		release: process.env.HOST_SERVICE_SENTRY_RELEASE,
		environment: process.env.HOST_SERVICE_SENTRY_ENVIRONMENT,
		tracesSampleRate: 0,
		// safety.ts keeps the process alive through uncaught exceptions; Sentry
		// must capture them without re-introducing the exit.
		integrations: [
			Sentry.onUncaughtExceptionIntegration({
				exitEvenIfOtherHandlersAreRegistered: false,
			}),
		],
		initialScope: {
			tags: {
				service: "host-service",
				...(options.organizationId
					? { organization_id: options.organizationId }
					: {}),
			},
		},
	});
	initialized = true;
}

export async function captureFatalStartupError(error: unknown): Promise<void> {
	if (!initialized) return;
	Sentry.captureException(error);
	try {
		await Sentry.flush(2_000);
	} catch {
		// Best-effort — the process is exiting either way.
	}
}

// One rescue event per reason per hour: the point is a countable field signal
// that a tunnel wedge occurred and was recovered, not a log firehose from a
// host stuck behind a captive portal all day.
const RESCUE_REPORT_INTERVAL_MS = 60 * 60_000;
const lastRescueReport = new Map<string, number>();

/**
 * Report that tunnel supervision rescued a connection that would previously
 * have wedged the host until a manual restart. Every one of these in the
 * field is a support ticket that didn't happen — and the count is how we
 * confirm the fix works outside the lab.
 */
export function reportTunnelRescue(
	reason: string,
	detail: Record<string, string | number>,
): void {
	if (!initialized) return;
	const now = Date.now();
	const last = lastRescueReport.get(reason) ?? 0;
	if (now - last < RESCUE_REPORT_INTERVAL_MS) return;
	lastRescueReport.set(reason, now);
	Sentry.captureMessage(`tunnel rescue: ${reason}`, {
		level: "warning",
		tags: { tunnel_rescue: reason },
		extra: detail,
	});
}
