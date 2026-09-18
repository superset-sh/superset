import { describe, expect, test } from "bun:test";
import SuperJSON from "superjson";
import { parseEnvPairs } from "./parseEnvPairs";

describe("parseEnvPairs", () => {
	test("parses repeatable pairs into a record", () => {
		expect(parseEnvPairs(["FOO=bar", "BAZ=qux"])).toEqual({
			FOO: "bar",
			BAZ: "qux",
		});
	});

	test("splits on the first = so values can contain =", () => {
		expect(parseEnvPairs(["DSN=postgres://u:p@h/db?a=1"])).toEqual({
			DSN: "postgres://u:p@h/db?a=1",
		});
	});

	test("keeps an explicitly empty value", () => {
		expect(parseEnvPairs(["NO_COLOR="])).toEqual({ NO_COLOR: "" });
	});

	test("lets a later pair win over an earlier one", () => {
		expect(parseEnvPairs(["FOO=first", "FOO=second"])).toEqual({
			FOO: "second",
		});
	});

	test("returns an empty record for no pairs", () => {
		expect(parseEnvPairs([])).toEqual({});
	});

	test("rejects a pair with no =", () => {
		expect(() => parseEnvPairs(["FOO"])).toThrow(/Invalid --env value/);
	});

	test("rejects a pair with an empty key", () => {
		expect(() => parseEnvPairs(["=bar"])).toThrow(/Invalid --env value/);
		expect(() => parseEnvPairs(["  =bar"])).toThrow(/Invalid --env value/);
	});

	test("rejects names the host record cannot carry", () => {
		expect(() => parseEnvPairs(["__proto__=value"])).toThrow(
			/Unsupported --env name/,
		);
		expect(() => parseEnvPairs(["constructor=value"])).toThrow(
			/Unsupported --env name/,
		);
		expect(() => parseEnvPairs(["prototype=value"])).toThrow(
			/Unsupported --env name/,
		);
	});

	test("keeps a name that merely shadows a prototype method", () => {
		expect(parseEnvPairs(["toString=v"])).toEqual({ toString: "v" });
	});

	// The host tRPC link transforms with SuperJSON, which throws on the names
	// above. Anything parseEnvPairs accepts must survive that transform.
	test("returns a record the host transport accepts", () => {
		const env = parseEnvPairs(["FOO=bar", "toString=v", "valueOf=1"]);
		expect(
			SuperJSON.parse<Record<string, string>>(SuperJSON.stringify(env)),
		).toEqual(env);
	});
});
