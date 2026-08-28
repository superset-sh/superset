/**
 * A side channel for state a throw site measured at the moment of failure and
 * the Sentry middleware should report alongside the event.
 *
 * The middleware decides what to report from the status code alone and never
 * reads error text; this is how a throw site hands it evidence without
 * changing the error, its message, or its classification. Attaching is not a
 * capture — an error carrying diagnostics is reported exactly when it would
 * have been anyway.
 *
 * Keyed by a module-private symbol: the error travels on to tRPC's error
 * formatter and out to the client, and only enumerable string keys go with it.
 */
const DIAGNOSTICS = Symbol("errorDiagnostics");

/** Undefined values are kept: "we looked and could not read it" is a fact
 * worth seeing in the event, and it is not the same as never having looked. */
export type ErrorDiagnostics = Record<string, number | string | undefined>;

export function attachErrorDiagnostics(
	error: unknown,
	diagnostics: ErrorDiagnostics,
): void {
	if (!(error instanceof Error)) return;
	(error as unknown as Record<symbol, ErrorDiagnostics>)[DIAGNOSTICS] =
		diagnostics;
}

export function readErrorDiagnostics(
	error: unknown,
): ErrorDiagnostics | undefined {
	if (!(error instanceof Error)) return undefined;
	return (error as unknown as Record<symbol, ErrorDiagnostics | undefined>)[
		DIAGNOSTICS
	];
}
