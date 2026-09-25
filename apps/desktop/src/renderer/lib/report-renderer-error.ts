export function reportRendererError(
	error: unknown,
	componentStack?: string | null,
) {
	console.error("[renderer] Error boundary caught:", error, componentStack);
	void import("@sentry/electron/renderer")
		.then((Sentry) =>
			Sentry.captureException(error, {
				extra: componentStack ? { componentStack } : undefined,
			}),
		)
		.catch(() => {});
}
