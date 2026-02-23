import { type NextRequest, NextResponse } from "next/server";

import { env } from "./env";

const desktopDevPort = process.env.DESKTOP_VITE_PORT || "5173";
const desktopDevOrigins =
	process.env.NODE_ENV === "development"
		? [
				`http://localhost:${desktopDevPort}`,
				`http://127.0.0.1:${desktopDevPort}`,
			]
		: [];

const allowedOrigins = [
	env.NEXT_PUBLIC_WEB_URL,
	env.NEXT_PUBLIC_ADMIN_URL,
	env.NEXT_PUBLIC_DESKTOP_URL,
	...desktopDevOrigins,
].filter(Boolean);

function getCorsHeaders(origin: string | null) {
	const isAllowed = origin && allowedOrigins.includes(origin);
	return {
		"Access-Control-Allow-Origin": isAllowed ? origin : "",
		"Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Authorization, x-trpc-source, trpc-accept, X-Electric-Backend, Producer-Id, Producer-Epoch, Producer-Seq, Stream-Closed",
		"Access-Control-Expose-Headers": [
			// Electric sync headers
			"electric-offset",
			"electric-handle",
			"electric-schema",
			"electric-cursor",
			"electric-chunk-last-offset",
			"electric-up-to-date",
			// Durable stream headers
			"Stream-Next-Offset",
			"Stream-Cursor",
			"Stream-Up-To-Date",
			"Stream-Closed",
			"Stream-Total-Size",
			"Stream-Write-Units",
			"Producer-Epoch",
			"Producer-Expected-Seq",
			"Producer-Received-Seq",
			"ETag",
		].join(", "),
		"Access-Control-Allow-Credentials": "true",
	};
}

export default function proxy(req: NextRequest) {
	const origin = req.headers.get("origin");
	const corsHeaders = getCorsHeaders(origin);

	// Handle preflight
	if (req.method === "OPTIONS") {
		return new NextResponse(null, { status: 204, headers: corsHeaders });
	}

	// Add CORS headers to all responses
	const response = NextResponse.next();
	for (const [key, value] of Object.entries(corsHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}

export const config = {
	matcher: [
		"/((?!_next|ingest|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
