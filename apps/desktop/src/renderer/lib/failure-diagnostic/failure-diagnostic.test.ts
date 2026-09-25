import { expect, test } from "bun:test";
import { failureDiagnostic } from "./failure-diagnostic";

test("diagnostics accept arbitrary thrown values without throwing again", () => {
	const circular: { self?: unknown } = {};
	circular.self = circular;
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	const malformedError = Object.assign(new Error(), { message: {} });
	const hostileError = new Error();
	Object.defineProperty(hostileError, "message", {
		get() {
			throw new Error("getter failed");
		},
	});
	for (const value of [
		null,
		undefined,
		false,
		0,
		1n,
		Symbol("failure"),
		circular,
		revoked.proxy,
		hostileError,
		malformedError,
	]) {
		expect(() => failureDiagnostic(value)).not.toThrow();
		expect(typeof failureDiagnostic(value)).toBe("string");
	}
	expect(failureDiagnostic(new Error("original failure"))).toBe(
		"original failure",
	);
	expect(failureDiagnostic("x".repeat(33000))).toHaveLength(33000);
	expect(failureDiagnostic(revoked.proxy)).toBe("[Unprintable error]");
});
