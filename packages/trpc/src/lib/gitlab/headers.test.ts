import { expect, test } from "bun:test";
import { gitlabHeaders } from "./headers";

test("header inputs copy iterable pairs and optional repeated object values", () => {
	for (const input of [
		new Headers({ Accept: "application/json" }),
		[["Accept", "application/json"]],
		{ Accept: "application/json" },
	])
		expect(gitlabHeaders(input).get("accept")).toBe("application/json");
	expect(
		gitlabHeaders({
			"X-Repeated": ["one", "two"],
			"X-Optional": undefined,
		}).get("x-repeated"),
	).toBe("one, two");
	expect(gitlabHeaders({ "X-Optional": undefined }).has("x-optional")).toBe(
		false,
	);
	const original = new Headers({ Authorization: "Bearer ORIGINAL_FAKE" });
	gitlabHeaders(original).set("Authorization", "Bearer REPLACEMENT_FAKE");
	expect(original.get("Authorization")).toBe("Bearer ORIGINAL_FAKE");
});
test("non-array iterable pairs work and malformed headers fail closed", () => {
	expect(
		gitlabHeaders({
			*[Symbol.iterator]() {
				yield new Set(["Accept", "application/json"]);
			},
		}).get("accept"),
	).toBe("application/json");
	for (const input of [
		[["Accept"]],
		[["Accept", "value", "extra"]],
		{ "X-Test": "value\r\nAuthorization: secret" },
	])
		expect(() => gitlabHeaders(input)).toThrow();
});
