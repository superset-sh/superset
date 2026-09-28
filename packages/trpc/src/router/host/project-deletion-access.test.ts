import { expect, test } from "bun:test";
import { authorizeProjectDeletion } from "./project-deletion-access";

const input = { organizationId: "org", machineId: "host", userId: "requester" };
const hostOwnedBy =
	(...owners: string[]) =>
	async (_o: string, _h: string, userId: string) =>
		owners.includes(userId);
const noOrgOwners = async () => false;

test("a caller that does not own the host cannot authorize", async () => {
	await expect(
		authorizeProjectDeletion(
			{ userId: "member", organizationIds: ["org"] },
			input,
			{
				isHostOwner: hostOwnedBy("requester"),
				isOrganizationOwner: noOrgOwners,
			},
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("a host owner credential cannot authorize across organizations", async () => {
	await expect(
		authorizeProjectDeletion(
			{ userId: "owner", organizationIds: ["other"] },
			input,
			{ isHostOwner: hostOwnedBy("owner"), isOrganizationOwner: noOrgOwners },
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("a requester who owns neither the host nor the organization is refused", async () => {
	expect(
		await authorizeProjectDeletion(
			{ userId: "owner", organizationIds: ["org"] },
			input,
			{ isHostOwner: hostOwnedBy("owner"), isOrganizationOwner: noOrgOwners },
		),
	).toEqual({ allowed: false });
});

test("an organization owner is allowed on a host they do not own", async () => {
	const seen: string[][] = [];
	expect(
		await authorizeProjectDeletion(
			{ userId: "owner", organizationIds: ["org"] },
			input,
			{
				isHostOwner: hostOwnedBy("owner"),
				isOrganizationOwner: async (...args) => {
					seen.push(args);
					return args[1] === "requester";
				},
			},
		),
	).toEqual({ allowed: true });
	expect(seen).toEqual([["org", "requester"]]);
});

test("a host owner requester is allowed", async () => {
	expect(
		await authorizeProjectDeletion(
			{ userId: "owner", organizationIds: ["org"] },
			input,
			{
				isHostOwner: hostOwnedBy("owner", "requester"),
				isOrganizationOwner: noOrgOwners,
			},
		),
	).toEqual({ allowed: true });
});
