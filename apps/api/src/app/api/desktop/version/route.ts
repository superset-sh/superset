const MINIMUM_DESKTOP_VERSION = "1.5.0";

/**
 * @deprecated Use the `desktop.minimumVersion` tRPC procedure
 * (`packages/trpc/src/router/desktop/desktop.ts`) instead. Kept here so older
 * shipped desktop builds — whose `useVersionCheck` hook still calls this REST
 * path — keep getting a sane response. Remove once the install base below
 * v1.5.0 has aged out and Vercel logs show no traffic on this path.
 *
 * Keep `MINIMUM_DESKTOP_VERSION` in sync with the tRPC procedure's constant
 * while both exist.
 */
export async function GET() {
	return Response.json({
		minimumVersion: MINIMUM_DESKTOP_VERSION,
		message: "Please update to the latest version to continue.",
	});
}
