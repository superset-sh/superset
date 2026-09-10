import { expect, test } from "bun:test";
import {
	authorizeHostUpdate,
	hostUpdateAuthorizationSchema,
} from "./update-access";

const input = { organizationId: "org", machineId: "host", userId: "requester" };
test("an organization member cannot authorize an update using a known host id", async () => {
	await expect(
		authorizeHostUpdate(
			{ userId: "member", organizationIds: ["org"] },
			input,
			async (_o, _h, u) => u === "requester",
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});
test("an owner credential cannot authorize across organizations", async () => {
	let lookups = 0;
	await expect(
		authorizeHostUpdate(
			{ userId: "owner", organizationIds: ["other"] },
			input,
			async () => {
				lookups++;
				return true;
			},
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(lookups).toBe(0);
});
test("host-owner credentials still cannot authorize a non-owner requester", async () => {
	expect(
		await authorizeHostUpdate(
			{ userId: "owner", organizationIds: ["org"] },
			input,
			async (_o, _h, u) => u === "owner",
		),
	).toEqual({ allowed: false });
});
test("both owner checks are scoped to the host and organization supplied by the host", async () => {
	const seen: string[][] = [];
	expect(
		await authorizeHostUpdate(
			{ userId: "owner", organizationIds: ["org"] },
			input,
			async (...args) => {
				seen.push(args);
				return true;
			},
		),
	).toEqual({ allowed: true });
	expect(seen).toEqual([
		["org", "host", "owner"],
		["org", "host", "requester"],
	]);
});

test("malformed caller identity is rejected before a UUID database lookup", () => {
	expect(
		hostUpdateAuthorizationSchema.safeParse({
			organizationId: "00000000-0000-4000-8000-000000000001",
			machineId: "host",
			userId: "not-a-uuid",
		}).success,
	).toBe(false);
});
