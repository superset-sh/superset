import { auth } from "@superset/auth/server";
import { headers } from "next/headers";

import { env } from "@/env";
import { HeaderCTA } from "./HeaderCTA";

export async function CTAButtons() {
	let session = null;
	try {
		session = await auth.api.getSession({ headers: await headers() });
	} catch (error) {
		// Handle errors from invalid/stale cookies (e.g., old Clerk cookies after migration to Better Auth)
		console.error("[marketing/CTAButtons] Failed to get session:", error);
	}

	return (
		<HeaderCTA isLoggedIn={!!session} dashboardUrl={env.NEXT_PUBLIC_WEB_URL} />
	);
}
