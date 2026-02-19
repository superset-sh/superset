import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { sessions } from "@superset/db/schema/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { DesktopRedirect } from "./components/DesktopRedirect";

export const metadata: Metadata = {
	title: "Desktop Authentication",
	description: "Completing authentication for Superset Desktop",
	robots: "noindex",
};

export default async function DesktopSuccessPage({
	searchParams,
}: {
	searchParams: Promise<{
		desktop_state?: string;
		desktop_protocol?: string;
		desktop_local_callback?: string;
	}>;
}) {
	const {
		desktop_state: state,
		desktop_protocol = "superset",
		desktop_local_callback: localCallbackBase,
	} = await searchParams;

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

	// Desktop and web need independent sessions with separate activeOrganizationId
	const headersObj = await headers();
	const userAgent = headersObj.get("user-agent") || "Superset Desktop App";
	const ipAddress =
		headersObj.get("x-forwarded-for")?.split(",")[0] ||
		headersObj.get("x-real-ip") ||
		undefined;

	const crypto = await import("node:crypto");
	const token = crypto.randomBytes(32).toString("base64url");
	const now = new Date();
	const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);

	await db.insert(sessions).values({
		token,
		userId: session.user.id,
		expiresAt,
		ipAddress,
		userAgent,
		activeOrganizationId: session.session.activeOrganizationId,
		updatedAt: now,
	});
	const desktopUrl = `${desktop_protocol}://auth/callback?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`;
	const localCallbackUrl = localCallbackBase
		? `${localCallbackBase}?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`
		: undefined;

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<DesktopRedirect url={desktopUrl} localCallbackUrl={localCallbackUrl} />
		</div>
	);
}
