import { expect, test } from "bun:test";
import { Hono } from "hono";
import superjson, { type SuperJSONResult } from "superjson";
import { hostTrpcRouter, trpcErrorResponse } from "./trpc-error";

test("the main router's errors are superjson-encoded", async () => {
	const router = hostTrpcRouter("/trpc/workspace.list");
	if (!router) throw new Error("no router for /trpc");
	const app = new Hono();
	app.get("*", (c) =>
		trpcErrorResponse(c, router, "SERVICE_UNAVAILABLE", "Host is not online"),
	);
	const body = (await (await app.request("/")).json()) as {
		error: SuperJSONResult;
	};
	expect(superjson.deserialize(body.error)).toMatchObject({
		message: "Host is not online",
	});
});
