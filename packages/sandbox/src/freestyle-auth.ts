import { Freestyle } from "freestyle";

const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== "https:") {
	throw new Error("Usage: bun run auth:freestyle <https-api-origin>");
}
if (!process.env.FREESTYLE_API_KEY)
	throw new Error("FREESTYLE_API_KEY is required");
const client = new Freestyle({ apiKey: process.env.FREESTYLE_API_KEY });
const url = new URL("/api/sandbox/freestyle-auth", origin).href;
const existing = (await client.tls.forwardAuth.list()).configs.find(
	(config) => config.url === url,
);
const config = existing ?? (await client.tls.forwardAuth.create({ url }));
console.log(`FREESTYLE_SANDBOX_FORWARD_AUTH_ID=${config.id}`);
