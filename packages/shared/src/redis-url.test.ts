import { expect, test } from "bun:test";
import { redisUrl } from "./redis-url";

test("Redis accepts native and TLS URLs and refuses web/database schemes", () => {
	for (const url of [
		"redis://localhost:6379/0",
		"rediss://user:disposable@redis.example.test:6380/2",
	])
		expect(redisUrl.parse(url)).toBe(url);
	for (const url of [
		"https://example.test",
		"postgres://localhost/db",
		"not-a-url",
	])
		expect(redisUrl.safeParse(url).success).toBe(false);
});
