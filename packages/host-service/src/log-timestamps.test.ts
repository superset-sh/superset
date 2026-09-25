import { describe, expect, test } from "bun:test";
import { installConsoleTimestamps, stampArgs } from "./log-timestamps";

const NOW = new Date("2026-09-05T20:39:15.000Z");

describe("stampArgs", () => {
	test("extends a leading string so format directives still apply", () => {
		expect(stampArgs(NOW, ["[host-service] %s ready", "daemon"])).toEqual([
			"2026-09-05T20:39:15.000Z [host-service] %s ready",
			"daemon",
		]);
	});

	test("prepends the stamp when the first argument is not a string", () => {
		const error = new Error("boom");
		expect(stampArgs(NOW, [error, { id: 1 }])).toEqual([
			"2026-09-05T20:39:15.000Z",
			error,
			{ id: 1 },
		]);
		expect(stampArgs(NOW, [])).toEqual(["2026-09-05T20:39:15.000Z"]);
	});
});

describe("installConsoleTimestamps", () => {
	test("stamps every console method and leaves the original arguments intact", () => {
		const calls: Record<string, unknown[][]> = {};
		const fake = Object.fromEntries(
			(["log", "info", "warn", "error", "debug"] as const).map((method) => [
				method,
				(...args: unknown[]) => {
					calls[method] = [...(calls[method] ?? []), args];
				},
			]),
		) as Pick<Console, "log" | "info" | "warn" | "error" | "debug">;

		installConsoleTimestamps(fake, () => NOW);
		fake.log("[host-service] starting");
		fake.info("[host-service] info");
		fake.warn("[git] slow", { ms: 15_000 });
		fake.error(new Error("x"));
		fake.debug("[host-service] debug");

		expect(calls.log).toEqual([
			["2026-09-05T20:39:15.000Z [host-service] starting"],
		]);
		expect(calls.info).toEqual([
			["2026-09-05T20:39:15.000Z [host-service] info"],
		]);
		expect(calls.debug).toEqual([
			["2026-09-05T20:39:15.000Z [host-service] debug"],
		]);
		expect(calls.warn).toEqual([
			["2026-09-05T20:39:15.000Z [git] slow", { ms: 15_000 }],
		]);
		expect(calls.error?.[0]?.[0]).toBe("2026-09-05T20:39:15.000Z");
		expect(calls.error?.[0]?.[1]).toBeInstanceOf(Error);
	});
});
