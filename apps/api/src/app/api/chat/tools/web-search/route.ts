import { auth } from "@superset/auth/server";
import { tavily } from "@tavily/core";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

const ratelimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(1000, "1 d"),
	prefix: "ratelimit:web-search",
});

export async function POST(request: Request): Promise<Response> {
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { success } = await ratelimit.limit(session.user.id);
	if (!success) {
		return Response.json(
			{ error: "Rate limit exceeded. Try again later." },
			{ status: 429 },
		);
	}

	let body: { query?: string; maxResults?: number };
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!body.query || typeof body.query !== "string") {
		return Response.json(
			{ error: "Missing or invalid 'query' field" },
			{ status: 400 },
		);
	}

	const rawMax = body.maxResults;
	const maxResults =
		typeof rawMax === "number" && Number.isFinite(rawMax)
			? Math.min(Math.max(rawMax, 1), 10)
			: 5;

	if (!env.TAVILY_API_KEY) {
		return Response.json(
			{ error: "Web search is not configured" },
			{ status: 503 },
		);
	}

	try {
		const client = tavily({ apiKey: env.TAVILY_API_KEY });
		const response = await client.search(body.query, { maxResults });

		return Response.json({
			results: response.results.map((r) => ({
				title: r.title,
				url: r.url,
				content: r.content,
			})),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Search failed";
		return Response.json({ error: message }, { status: 502 });
	}
}
