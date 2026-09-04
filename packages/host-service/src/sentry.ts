import * as Sentry from "@sentry/node";
import { createSentryEventThrottle } from "@superset/shared/sentry-throttle";

let initialized = false;

// Shared across the process: the point is to notice a repeat, which needs one
// instance rather than one per call.
const throttleRepeats = createSentryEventThrottle();

export function initSentry(options: { organizationId?: string }): void {
	if (initialized) return;
	const dsn = process.env.HOST_SERVICE_SENTRY_DSN;
	if (!dsn) return;
	Sentry.init({
		dsn,
		release: process.env.HOST_SERVICE_SENTRY_RELEASE,
		environment: process.env.HOST_SERVICE_SENTRY_ENVIRONMENT,
		tracesSampleRate: 0,
		// A host that fails once usually fails in a loop: git.getStatus alone
		// sent 135k copies of one `spawn EBADF` from seven machines last month.
		beforeSend: throttleRepeats,
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
				organization_id: options.organizationId,
				run_mode: process.env.SUPERSET_HOST_RUN_MODE,
				cloud_workspace_id: process.env.SUPERSET_SANDBOX_WORKSPACE_ID,
				image_tag: process.env.SUPERSET_SANDBOX_IMAGE_TAG,
				provider: process.env.SUPERSET_SANDBOX_PROVIDER,
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
