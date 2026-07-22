const LINEAR_IMAGE_HOST = "uploads.linear.app";
const LINEAR_IMAGE_FETCH_TIMEOUT_MS = 15_000;
const NO_STORE_HEADERS = {
	"Cache-Control": "no-store",
	Pragma: "no-cache",
	"X-Content-Type-Options": "nosniff",
} as const;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
	"image/avif",
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/webp",
]);

type LinearImageSession = {
	user?: unknown;
	session?: {
		activeOrganizationId?: string | null;
	};
} | null;

type LinearImageConnection =
	| {
			accessToken: string;
	  }
	| null
	| undefined;

type LinearImageProxyDependencies = {
	fetch: typeof fetch;
	findLinearConnection: (
		organizationId: string,
	) => Promise<LinearImageConnection>;
	getSession: (headers: Headers) => Promise<LinearImageSession>;
};

function noStoreResponse(
	body: BodyInit | null,
	init: ResponseInit = {},
): Response {
	const headers = new Headers(init.headers);
	for (const [header, value] of Object.entries(NO_STORE_HEADERS)) {
		headers.set(header, value);
	}

	return new Response(body, {
		...init,
		headers,
	});
}

function getAllowedImageContentType(response: Response): string | null {
	const contentType = response.headers
		.get("content-type")
		?.split(";")[0]
		?.trim()
		.toLowerCase();

	return contentType && ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)
		? contentType
		: null;
}

export async function handleLinearImageProxy(
	request: Request,
	dependencies: LinearImageProxyDependencies,
): Promise<Response> {
	try {
		return await handleLinearImageProxyRequest(request, dependencies);
	} catch (error) {
		console.error("[proxy/linear-image] Linear proxy failed:", {
			errorName: error instanceof Error ? error.name : typeof error,
		});
		return noStoreResponse("Failed to proxy Linear image", { status: 500 });
	}
}

async function handleLinearImageProxyRequest(
	request: Request,
	dependencies: LinearImageProxyDependencies,
): Promise<Response> {
	const sessionData = await dependencies.getSession(request.headers);

	if (!sessionData?.user) {
		return noStoreResponse("Unauthorized", { status: 401 });
	}

	const organizationId = sessionData.session?.activeOrganizationId;
	if (!organizationId) {
		return noStoreResponse("No active organization", { status: 400 });
	}

	const url = new URL(request.url);
	const linearUrl = url.searchParams.get("url");

	if (!linearUrl) {
		return noStoreResponse("Missing url parameter", { status: 400 });
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(linearUrl);
	} catch {
		return noStoreResponse("Invalid URL", { status: 400 });
	}

	if (parsedUrl.protocol !== "https:" || parsedUrl.host !== LINEAR_IMAGE_HOST) {
		return noStoreResponse(
			`Only https://${LINEAR_IMAGE_HOST} URLs are allowed`,
			{
				status: 400,
			},
		);
	}

	if (parsedUrl.username || parsedUrl.password) {
		return noStoreResponse("Linear image URLs cannot include credentials", {
			status: 400,
		});
	}

	const connection = await dependencies.findLinearConnection(organizationId);

	if (!connection) {
		return noStoreResponse("Linear integration not connected", { status: 400 });
	}

	try {
		const linearResponse = await dependencies.fetch(parsedUrl.toString(), {
			headers: {
				Authorization: `Bearer ${connection.accessToken}`,
			},
			redirect: "error",
			signal: AbortSignal.timeout(LINEAR_IMAGE_FETCH_TIMEOUT_MS),
		});

		if (!linearResponse.ok) {
			console.error("[proxy/linear-image] Linear fetch failed:", {
				host: parsedUrl.host,
				hasQuery: parsedUrl.search.length > 0,
				pathLength: parsedUrl.pathname.length,
				status: linearResponse.status,
				statusText: linearResponse.statusText,
			});
			return noStoreResponse("Failed to fetch image from Linear", {
				status: linearResponse.status,
			});
		}

		const contentType = getAllowedImageContentType(linearResponse);
		if (!contentType) {
			return noStoreResponse("Unsupported Linear image content type", {
				status: 415,
			});
		}

		return noStoreResponse(linearResponse.body, {
			status: 200,
			headers: {
				"Content-Type": contentType,
			},
		});
	} catch (error) {
		console.error("[proxy/linear-image] Linear fetch threw:", {
			errorName: error instanceof Error ? error.name : typeof error,
			host: parsedUrl.host,
			hasQuery: parsedUrl.search.length > 0,
			pathLength: parsedUrl.pathname.length,
		});
		return noStoreResponse("Failed to fetch image from Linear", {
			status: 502,
		});
	}
}
