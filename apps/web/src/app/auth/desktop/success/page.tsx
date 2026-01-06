import { auth } from "@superset/auth";
import { db } from "@superset/db/client";
import { sessions } from "@superset/db/schema/auth";
import { headers } from "next/headers";

import { DesktopRedirect } from "./components/DesktopRedirect";

export default async function DesktopSuccessPage({
	searchParams,
}: {
	searchParams: Promise<{ desktop_state?: string }>;
}) {
	const { desktop_state: state } = await searchParams;

	if (!state) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<p className="text-xl text-muted-foreground">Missing auth state</p>
				<p className="text-muted-foreground/70">
					Please try signing in again from the desktop app.
				</p>
			</div>
		);
	}

	// Get session from Better Auth
	let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
	try {
		session = await auth.api.getSession({ headers: await headers() });
	} catch (error) {
		console.error("Failed to get session for desktop auth:", error);
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<p className="text-xl text-muted-foreground">Authentication failed</p>
				<p className="text-muted-foreground/70">
					Please try signing in again from the desktop app.
				</p>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<p className="text-xl text-muted-foreground">Authentication failed</p>
				<p className="text-muted-foreground/70">
					Please try signing in again from the desktop app.
				</p>
			</div>
		);
	}

	// Create a separate session for the desktop app instead of reusing the browser session
	// This ensures desktop and web have independent sessions with separate activeOrganizationId
	const headersObj = await headers();
	const userAgent = headersObj.get("user-agent") || "Superset Desktop App";
	const ipAddress =
		headersObj.get("x-forwarded-for")?.split(",")[0] ||
		headersObj.get("x-real-ip") ||
		undefined;

	// Generate a unique session token for the desktop app
	const crypto = await import("node:crypto");
	const token = crypto.randomBytes(32).toString("base64url");
	const now = new Date();
	const expiresAt = new Date(
		Date.now() + 60 * 60 * 24 * 30 * 1000, // 30 days (matching auth config)
	);

	// Create a new session record in the database
	await db.insert(sessions).values({
		token,
		userId: session.user.id,
		expiresAt,
		ipAddress,
		userAgent,
		activeOrganizationId: session.session.activeOrganizationId,
		updatedAt: now,
	});
	const protocol =
		process.env.NODE_ENV === "development" ? "superset-dev" : "superset";
	const desktopUrl = `${protocol}://auth/callback?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`;

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<DesktopRedirect url={desktopUrl} />
		</div>
	);
}
