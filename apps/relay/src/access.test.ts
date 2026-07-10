import { describe, expect, it } from "bun:test";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	type AccessDenial,
	accessDenialMessage,
	checkHostAccess,
} from "./access";
import type { AuthContext } from "./auth";

const auth = (organizationIds: string[]): AuthContext => ({
	sub: "user-1",
	email: "u@example.com",
	organizationIds,
});

describe("accessDenialMessage", () => {
	const reasons: AccessDenial[] = [
		"invalid_host",
		"not_in_org",
		"not_registered",
		"error",
	];

	it("returns a non-empty message for every reason", () => {
		for (const r of reasons) {
			expect(accessDenialMessage(r).length).toBeGreaterThan(0);
		}
	});

	it("keeps every close reason within the 123-byte WS limit", () => {
		// The relay sends `Forbidden: ${message}` as the WS close reason, which
		// the spec caps at 123 UTF-8 bytes.
		for (const r of reasons) {
			const frame = `Forbidden: ${accessDenialMessage(r)}`;
			expect(Buffer.byteLength(frame, "utf8")).toBeLessThanOrEqual(123);
		}
	});

	it("distinguishes not_in_org from not_registered", () => {
		expect(accessDenialMessage("not_in_org")).not.toBe(
			accessDenialMessage("not_registered"),
		);
	});
});

describe("checkHostAccess (local short-circuits)", () => {
	it("rejects an unparseable host id as invalid_host without a network call", async () => {
		const result = await checkHostAccess(auth(["org-a"]), "token", "no-colon");
		expect(result).toEqual({ ok: false, reason: "invalid_host" });
	});

	it("rejects a host in an org the user isn't a member of as not_in_org", async () => {
		const hostId = buildHostRoutingKey("org-b", "machine-1");
		const result = await checkHostAccess(auth(["org-a"]), "token", hostId);
		expect(result).toEqual({ ok: false, reason: "not_in_org" });
	});
});
