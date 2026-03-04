import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

const LINEAR_IMAGE_HOST = "uploads.linear.app";
const CACHE_MAX_AGE = 31536000; // 1 year (Linear URLs are content-addressed)

export async function GET(request: Request): Promise<Response> {
	const sessionData = await auth.api.getSession({
		headers: request.headers,
	});

	if (!sessionData?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const organizationId = sessionData.session.activeOrganizationId;
	if (!organizationId) {
		return new Response("No active organization", { status: 400 });
	}

	const url = new URL(request.url);
	const linearUrl = url.searchParams.get("url");

	if (!linearUrl) {
		return new Response("Missing url parameter", { status: 400 });
	}

	// Validate the URL is from Linear's uploads domain (security)
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(linearUrl);
	} catch {
		return new Response("Invalid URL", { status: 400 });
	}

	if (parsedUrl.host !== LINEAR_IMAGE_HOST) {
		return new Response(`Only ${LINEAR_IMAGE_HOST} URLs are allowed`, {
			status: 400,
		});
	}

	// Get the org's Linear access token
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		return new Response("Linear integration not connected", { status: 400 });
	}

	// Fetch the image from Linear with auth
	const linearResponse = await fetch(linearUrl, {
		headers: {
			Authorization: `Bearer ${connection.accessToken}`,
		},
	});

	if (!linearResponse.ok) {
		console.error("[proxy/linear-image] Linear fetch failed:", {
			status: linearResponse.status,
			statusText: linearResponse.statusText,
			url: linearUrl,
		});
		return new Response("Failed to fetch image from Linear", {
			status: linearResponse.status,
		});
	}

	const contentType = linearResponse.headers.get("content-type") ?? "image/png";
	const imageData = await linearResponse.arrayBuffer();

	return new Response(imageData, {
		status: 200,
		headers: {
			"Content-Type": contentType,
			"Cache-Control": `public, max-age=${CACHE_MAX_AGE}, immutable`,
		},
	});
}
