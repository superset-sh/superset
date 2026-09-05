import { auth } from "@superset/auth/server";
import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import superjson from "superjson";
import { env } from "@/env";

export const dynamic = "force-dynamic";

const PRIVATE = { "cache-control": "private, no-store" } as const;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function forwardsOverCleartext(rawUrl: string): boolean {
	const url = new URL(rawUrl);
	if (url.protocol === "https:") return false;
	return !(
		LOOPBACK.has(url.hostname) ||
		url.hostname.endsWith(".localhost") ||
		url.hostname.endsWith(".localtest.me")
	);
}

export async function GET() {
	if (forwardsOverCleartext(env.NEXT_PUBLIC_API_URL)) {
		console.error(
			"[marketing/viewer] refusing to forward the session cookie to a non-HTTPS API origin",
		);
		return NextResponse.json(
			{ viewer: null },
			{ status: 500, headers: PRIVATE },
		);
	}

	const incoming = await headers();

	let session = null;
	try {
		session = await auth.api.getSession({ headers: incoming });
	} catch (error) {
		console.error("[marketing/viewer] session error:", error);
	}

	if (!session) {
		return NextResponse.json({ viewer: null }, { headers: PRIVATE });
	}

	const cookie = incoming.get("cookie");
	if (!cookie) {
		return NextResponse.json({ viewer: null }, { headers: PRIVATE });
	}

	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
				transformer: superjson,
				headers: () => ({ cookie }),
			}),
		],
	});

	try {
		const viewer = await client.leaderboard.viewer.query();
		return NextResponse.json({ viewer }, { headers: PRIVATE });
	} catch (error) {
		console.error("[marketing/viewer] lookup failed:", error);
		return NextResponse.json({ viewer: null }, { headers: PRIVATE });
	}
}
