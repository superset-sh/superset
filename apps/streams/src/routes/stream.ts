import {
	DURABLE_STREAM_PROTOCOL_QUERY_PARAMS,
	STREAM_CURSOR_HEADER,
	STREAM_OFFSET_HEADER,
	STREAM_UP_TO_DATE_HEADER,
} from "@durable-streams/client";
import { Hono } from "hono";

export const PROTOCOL_RESPONSE_HEADERS = [
	STREAM_OFFSET_HEADER,
	STREAM_CURSOR_HEADER,
	STREAM_UP_TO_DATE_HEADER,
	"Content-Type",
	"Cache-Control",
	"ETag",
] as const;

const PROTOCOL_QUERY_PARAMS = DURABLE_STREAM_PROTOCOL_QUERY_PARAMS;

const _HEADERS_TO_STRIP = [
	"content-encoding",
	"content-length",
	"transfer-encoding",
	"connection",
] as const;

export function createStreamRoutes(baseUrl: string) {
	const app = new Hono();

	app.get("/sessions/:sessionId", async (c) => {
		const sessionId = c.req.param("sessionId");

		const upstreamUrl = new URL(`${baseUrl}/v1/stream/sessions/${sessionId}`);

		for (const param of PROTOCOL_QUERY_PARAMS) {
			const value = c.req.query(param);
			if (value !== undefined) {
				upstreamUrl.searchParams.set(param, value);
			}
		}

		try {
			const upstreamResponse = await fetch(upstreamUrl.toString(), {
				method: "GET",
				headers: {
					...Object.fromEntries(
						[...c.req.raw.headers.entries()].filter(
							([key]) =>
								key.toLowerCase() === "authorization" ||
								key.toLowerCase().startsWith("x-"),
						),
					),
				},
			});

			if (!upstreamResponse.ok) {
				if (upstreamResponse.status === 404) {
					return c.json({ error: "Stream not found" }, 404);
				}

				const errorText = await upstreamResponse
					.text()
					.catch(() => "Unknown error");
				return c.json(
					{
						error: "Upstream error",
						status: upstreamResponse.status,
						details: errorText,
					},
					upstreamResponse.status as 400 | 500,
				);
			}

			const responseHeaders = new Headers();

			for (const header of PROTOCOL_RESPONSE_HEADERS) {
				const value = upstreamResponse.headers.get(header);
				if (value !== null) {
					responseHeaders.set(header, value);
				}
			}

			if (upstreamResponse.status === 204) {
				const nextOffset = upstreamResponse.headers.get(STREAM_OFFSET_HEADER);
				if (nextOffset) {
					c.header(STREAM_OFFSET_HEADER, nextOffset);
				}
				return c.body(null, 204);
			}

			if (!upstreamResponse.body) {
				for (const [key, value] of responseHeaders.entries()) {
					c.header(key, value);
				}
				return c.body(null, upstreamResponse.status as 200);
			}

			for (const [key, value] of responseHeaders.entries()) {
				c.header(key, value);
			}
			c.status(upstreamResponse.status as 200);
			return c.body(upstreamResponse.body);
		} catch (error) {
			console.error("Stream proxy error:", error);
			return c.json(
				{
					error: "Failed to proxy stream request",
					details: (error as Error).message,
				},
				502,
			);
		}
	});

	return app;
}
