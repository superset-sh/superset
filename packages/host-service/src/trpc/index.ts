import * as Sentry from "@sentry/node";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { HostServiceContext } from "../types";
import { readErrorDiagnostics } from "./error-diagnostics";
import {
	type DeleteInProgressCause,
	isDeleteInProgressCause,
	isProjectNotSetupCause,
	isTeardownFailureCause,
	type ProjectNotSetupCause,
	type TeardownFailureCause,
} from "./error-types";

export interface RouterMeta {
	/**
	 * Per-procedure timeout in milliseconds, applied to query procedures
	 * via `queryProcedure`. Defaults to 5_000 when omitted. Set higher for
	 * procedures that legitimately take longer (e.g. searching large
	 * histories or shelling out to long-running commands).
	 */
	timeoutMs?: number;
}

const t = initTRPC
	.context<HostServiceContext>()
	.meta<RouterMeta>()
	.create({
		transformer: superjson,
		errorFormatter({ shape, error }) {
			// tRPC wraps non-Error `cause` values via getCauseFromUnknown() into a
			// synthetic UnknownCauseError that carries the original fields as own
			// properties. Superjson then serializes it as an Error (message/stack
			// only) and drops our fields. Re-build a plain object so the wire
			// format keeps `kind`, `exitCode`, `outputTail`, etc.
			const teardownFailure: TeardownFailureCause | undefined =
				isTeardownFailureCause(error.cause)
					? {
							kind: "TEARDOWN_FAILED",
							exitCode: error.cause.exitCode,
							signal: error.cause.signal,
							timedOut: error.cause.timedOut,
							outputTail: error.cause.outputTail,
						}
					: undefined;
			const projectNotSetup: ProjectNotSetupCause | undefined =
				isProjectNotSetupCause(error.cause)
					? {
							kind: "PROJECT_NOT_SETUP",
							projectId: error.cause.projectId,
						}
					: undefined;
			const deleteInProgress: DeleteInProgressCause | undefined =
				isDeleteInProgressCause(error.cause)
					? { kind: "DELETE_IN_PROGRESS" }
					: undefined;
			return {
				...shape,
				data: {
					...shape.data,
					teardownFailure,
					projectNotSetup,
					deleteInProgress,
				},
			};
		},
	});

/**
 * Middleware that reports unhandled errors to Sentry.
 *
 * Contract: expected domain states are translated by routers/adapters into
 * non-500 TRPCErrors before they get here. Anything still
 * INTERNAL_SERVER_ERROR at this boundary is a bug and is always reported —
 * fix the missing translation at the throw site, never add a filter here.
 */
const sentryMiddleware = t.middleware(async ({ next, path, type }) => {
	const result = await next();

	if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
		const error = result.error;
		const originalError = error.cause instanceof Error ? error.cause : error;

		Sentry.captureException(originalError, {
			tags: {
				trpc_path: path,
				trpc_type: type,
				trpc_code: error.code,
			},
			extra: {
				trpc_message: error.message,
				// State a throw site measured at the moment of failure. Reporting
				// is unchanged: this only fills in an event that is already going.
				...readErrorDiagnostics(originalError),
			},
		});
	}

	return result;
});

const baseProcedure = t.procedure.use(sentryMiddleware);

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = baseProcedure;

export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
	if (!ctx.isAuthenticated) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Invalid or missing authentication token.",
		});
	}
	return next({ ctx });
});

/**
 * For procedures that only make sense on a machine someone owns.
 *
 * A cloud workspace's sandbox is one repo, one project, one workspace, fixed
 * at provision: the checkout *is* the workspace and there is no base repo to
 * branch from. Adding a project, removing the only one, or cutting a worktree
 * inside it produces state the cloud side can neither see nor clean up. The
 * check lives here rather than in each caller because the callers are
 * whatever runs in the sandbox — an agent, the CLI, a shell — not just our
 * own UI.
 *
 * Reads `process.env` rather than the validated `env`: importing that here
 * would drag full env validation into the import graph of every consumer of
 * the router, including tests that have no reason to supply one.
 */
export const machineOnlyProcedure = protectedProcedure.use(
	async ({ ctx, next, path }) => {
		if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: `${path} is not available in a cloud workspace: its sandbox holds exactly one project and one workspace.`,
			});
		}
		return next({ ctx });
	},
);

const DEFAULT_QUERY_TIMEOUT_MS = 5_000;

const timeoutMiddleware = t.middleware(async ({ next, type, path, meta }) => {
	if (type !== "query") return next();
	const timeoutMs = meta?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(
				new TRPCError({
					code: "TIMEOUT",
					message: `${path} timed out after ${timeoutMs}ms`,
				}),
			);
		}, timeoutMs);
	});

	try {
		return await Promise.race([next(), timeoutPromise]);
	} finally {
		if (timer) clearTimeout(timer);
	}
});

/**
 * Query procedures with a server-side timeout. Hung filesystem/git work
 * rejects after `meta.timeoutMs` (default 5s) so the renderer doesn't
 * spin forever. React Query is configured to retry on `TIMEOUT` errors.
 *
 * Use this for `.query` procedures only — mutations have variable
 * latency and shouldn't share a blanket budget.
 *
 * See `packages/host-service/QUERY_TIMEOUTS.md` for the policy and
 * current per-procedure budgets.
 */
export const queryProcedure = protectedProcedure.use(timeoutMiddleware);

export type {
	ProjectNotSetupCause,
	TeardownFailureCause,
} from "./error-types";
// INTERIM cross-runtime types via dist-types — see docs/interim-router-types.md
export type { AppRouter } from "./router";
