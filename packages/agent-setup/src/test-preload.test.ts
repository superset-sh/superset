import { expect, it } from "bun:test";
import { homedir } from "node:os";
import { resolve } from "node:path";

it("loads an isolated Superset home before agent-setup tests", () => {
	const preloadHome = Reflect.get(
		globalThis,
		Symbol.for("superset.test.supersetHome"),
	);
	expect(typeof preloadHome).toBe("string");
	expect(process.env.SUPERSET_HOME_DIR).toBe(preloadHome);
	expect(resolve(process.env.SUPERSET_HOME_DIR ?? "")).not.toBe(
		resolve(homedir(), ".superset"),
	);
});

it("clears inherited wrapper metadata before agent-setup tests", () => {
	for (const key of [
		"SUPERSET_AGENT_ID",
		"SUPERSET_AGENT_LAUNCH_ID",
		"SUPERSET_NESTED_AGENT",
		"SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN",
	]) {
		expect(process.env[key]).toBeUndefined();
	}
});
