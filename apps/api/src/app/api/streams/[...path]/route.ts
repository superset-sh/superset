import { auth } from "@superset/auth/server";
import { env } from "@/env";

export const maxDuration = 300;

const ALLOWED_HEADERS = [
	"authorization",
	"content-type",
	"accept",
	"x-actor-id",
];

function forwardHeaders(source: Headers): Headers {
	const headers = new Headers();
	for (const key of ALLOWED_HEADERS) {
		const value = source.get(key);
		if (value) {
			headers.set(key, value);
		}
	}
	return headers;
}

async function proxy(request: Request): Promise<Response> {
	const sessionData = await auth.api.getSession({
		headers: request.headers,
	});
	if (!sessionData?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const url = new URL(request.url);
	const upstreamPath = url.pathname.replace(/^\/api\/streams/, "");
	const upstream = new URL(`${env.STREAMS_URL}${upstreamPath}${url.search}`);

	const headers = forwardHeaders(request.headers);

	const hasBody = request.method !== "GET" && request.method !== "HEAD";

	const response = await fetch(upstream, {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		// @ts-expect-error -- Node fetch supports duplex for streaming request bodies
		duplex: hasBody ? "half" : undefined,
	});

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
