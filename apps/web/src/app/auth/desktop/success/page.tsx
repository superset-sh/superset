import { auth } from "@superset/auth";
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

	const token = session.session.token;
	const expiresAt = session.session.expiresAt.toISOString();
	const protocol =
		process.env.NODE_ENV === "development" ? "superset-dev" : "superset";
	const desktopUrl = `${protocol}://auth/callback?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt)}&state=${encodeURIComponent(state)}`;

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<DesktopRedirect url={desktopUrl} />
		</div>
	);
}
