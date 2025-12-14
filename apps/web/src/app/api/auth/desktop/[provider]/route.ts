import { currentUser } from "@clerk/nextjs/server";
import { SignJWT } from "jose";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

const DESKTOP_PROTOCOL =
	process.env.NODE_ENV === "development" ? "superset-dev" : "superset";

/**
 * Desktop auth endpoint
 *
 * Flow:
 * 1. Desktop opens browser to /api/auth/desktop/google
 * 2. If not authenticated, redirect to Clerk sign-in
 * 3. Once authenticated, create JWT with user info
 * 4. Redirect to desktop via deep link
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider } = await params;

	// Validate provider
	if (!["google", "github"].includes(provider)) {
		return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
	}

	// Check if user is authenticated
	const user = await currentUser();

	if (!user) {
		// Redirect to sign-in with callback to this endpoint
		const callbackUrl = new URL(request.url);
		const signInUrl = new URL("/sign-in", request.url);
		signInUrl.searchParams.set("redirect_url", callbackUrl.pathname);
		return NextResponse.redirect(signInUrl);
	}

	// User is authenticated - create JWT for desktop
	const jwt = await createDesktopToken({
		userId: user.id,
		email: user.emailAddresses[0]?.emailAddress ?? "",
		name:
			user.firstName && user.lastName
				? `${user.firstName} ${user.lastName}`
				: (user.username ?? "User"),
		avatarUrl: user.imageUrl,
	});

	// Redirect to desktop app via deep link
	const desktopUrl = new URL(`${DESKTOP_PROTOCOL}://auth/callback`);
	desktopUrl.searchParams.set("token", jwt);

	return NextResponse.redirect(desktopUrl.toString());
}

interface DesktopTokenPayload {
	userId: string;
	email: string;
	name: string;
	avatarUrl: string | null;
}

async function createDesktopToken(
	payload: DesktopTokenPayload,
): Promise<string> {
	const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);

	const jwt = await new SignJWT({
		userId: payload.userId,
		email: payload.email,
		name: payload.name,
		avatarUrl: payload.avatarUrl,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("7d") // 7 day expiration
		.sign(secret);

	return jwt;
}
