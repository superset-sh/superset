import { auth } from "@superset/auth/server";
import { headers } from "next/headers";

import { env } from "@/env";
import { HeaderCTA } from "./HeaderCTA";

export async function CTAButtons() {
	let session = null;
	try {
		session = await auth.api.getSession({ headers: await headers() });
	} catch {
		// Expected when visitors have invalid/stale cookies (e.g., old Clerk cookies after migration to Better Auth).
		// Session is optional on the marketing site — we just show the logged-out CTA.
		console.warn("[marketing/CTAButtons] Failed to get session");
	}

	return (
		<HeaderCTA isLoggedIn={!!session} dashboardUrl={env.NEXT_PUBLIC_WEB_URL} />
	);
}
