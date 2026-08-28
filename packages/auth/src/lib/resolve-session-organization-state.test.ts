import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { SelectMember } from "@superset/db/schema/auth";
import type { ResolveSessionOrganizationDeps } from "./resolve-session-organization-state";

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findMany: mock(async () => []),
			},
		},
		select: mock(() => ({
			from: mock(() => ({
				where: mock(() => ({
					limit: mock(async () => []),
				})),
			})),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({
					returning: mock(async () => []),
				})),
			})),
		})),
	},
}));

const { resolveSessionOrganizationState } = await import(
	"./resolve-session-organization-state"
);

function createMember(
	organizationId: string,
	overrides: Partial<SelectMember> = {},
): SelectMember {
	return {
		id: `member-${organizationId}`,
		organizationId,
		userId: "user-1",
		role: "member",
		createdAt: new Date("2026-03-21T00:00:00.000Z"),
		...overrides,
	};
}

describe("resolveSessionOrganizationState", () => {
	const listMemberships = mock<
		ResolveSessionOrganizationDeps["listMemberships"]
	>(async () => []);
	const updateSessionActiveOrganization = mock<
		ResolveSessionOrganizationDeps["updateSessionActiveOrganization"]
	>(async () => true);
	const getSessionActiveOrganization = mock<
		ResolveSessionOrganizationDeps["getSessionActiveOrganization"]
	>(async () => null);
	const getLastActiveOrganization = mock<
		ResolveSessionOrganizationDeps["getLastActiveOrganization"]
	>(async () => null);

	const deps: ResolveSessionOrganizationDeps = {
		listMemberships,
		getLastActiveOrganization,
		updateSessionActiveOrganization,
		getSessionActiveOrganization,
	};

	beforeEach(() => {
		listMemberships.mockReset();
		updateSessionActiveOrganization.mockReset();
		getSessionActiveOrganization.mockReset();
		getLastActiveOrganization.mockReset();
		updateSessionActiveOrganization.mockImplementation(async () => true);
		getSessionActiveOrganization.mockImplementation(async () => null);
		getLastActiveOrganization.mockImplementation(async () => null);
	});

	it("falls back to the most recent membership when the user has never switched", async () => {
		listMemberships.mockImplementation(async () => [
			createMember("org-1"),
			createMember("org-2", {
				createdAt: new Date("2026-03-20T00:00:00.000Z"),
			}),
		]);

		const result = await resolveSessionOrganizationState(
			{
				userId: "user-1",
				session: { id: "session-1", activeOrganizationId: null },
			},
			deps,
		);

		expect(result.activeOrganizationId).toBe("org-1");
		expect(result.membership?.organizationId).toBe("org-1");
		expect(updateSessionActiveOrganization).toHaveBeenCalledWith({
			sessionId: "session-1",
			previousActiveOrganizationId: null,
			nextActiveOrganizationId: "org-1",
		});
		expect(getSessionActiveOrganization).not.toHaveBeenCalled();
	});

	it("resumes the organization the user last switched to when the session has none", async () => {
		listMemberships.mockImplementation(async () => [
			createMember("org-newest"),
			createMember("org-chosen", {
				createdAt: new Date("2026-03-20T00:00:00.000Z"),
			}),
		]);
		getLastActiveOrganization.mockImplementation(async () => "org-chosen");

		const result = await resolveSessionOrganizationState(
			{
				userId: "user-1",
				session: { id: "session-1", activeOrganizationId: null },
			},
			deps,
		);

		expect(result.activeOrganizationId).toBe("org-chosen");
		expect(result.membership?.organizationId).toBe("org-chosen");
		expect(updateSessionActiveOrganization).toHaveBeenCalledWith({
			sessionId: "session-1",
			previousActiveOrganizationId: null,
			nextActiveOrganizationId: "org-chosen",
		});
	});

	it("ignores a last active organization the user is no longer a member of", async () => {
		listMemberships.mockImplementation(async () => [
			createMember("org-newest"),
			createMember("org-older", {
				createdAt: new Date("2026-03-20T00:00:00.000Z"),
			}),
		]);
		getLastActiveOrganization.mockImplementation(async () => "org-left");

		const result = await resolveSessionOrganizationState(
			{
				userId: "user-1",
				session: { id: "session-1", activeOrganizationId: null },
			},
			deps,
		);

		expect(result.activeOrganizationId).toBe("org-newest");
	});

	it("keeps the session's own organization without consulting the last active one", async () => {
		listMemberships.mockImplementation(async () => [
			createMember("org-newest"),
			createMember("org-session", {
				createdAt: new Date("2026-03-20T00:00:00.000Z"),
			}),
		]);

		const result = await resolveSessionOrganizationState(
			{
				userId: "user-1",
				session: { id: "session-1", activeOrganizationId: "org-session" },
			},
			deps,
		);

		expect(result.activeOrganizationId).toBe("org-session");
		expect(getLastActiveOrganization).not.toHaveBeenCalled();
		expect(updateSessionActiveOrganization).not.toHaveBeenCalled();
	});

	it("replaces stale active org ids with the most recent valid membership", async () => {
		listMemberships.mockImplementation(async () => [
			createMember("org-2"),
			createMember("org-1", {
				createdAt: new Date("2026-03-20T00:00:00.000Z"),
			}),
		]);

		const result = await resolveSessionOrganizationState(
			{
				userId: "user-1",
				session: {
					id: "session-1",
					activeOrganizationId: "org-missing",
				},
			},
			deps,
		);

		expect(result.activeOrganizationId).toBe("org-2");
		expect(result.membership?.organizationId).toBe("org-2");
		expect(updateSessionActiveOrganization).toHaveBeenCalledWith({
			sessionId: "session-1",
			previousActiveOrganizationId: "org-missing",
			nextActiveOrganizationId: "org-2",
		});
	});

	it("clears stale active org ids when the user has no memberships", async () => {
		listMemberships.mockImplementation(async () => []);

		const result = await resolveSessionOrganizationState(
			{
				userId: "user-1",
				session: {
					id: "session-1",
					activeOrganizationId: "org-missing",
				},
			},
			deps,
		);

		expect(result.activeOrganizationId).toBeNull();
		expect(result.membership).toBeUndefined();
		expect(updateSessionActiveOrganization).toHaveBeenCalledWith({
			sessionId: "session-1",
			previousActiveOrganizationId: "org-missing",
			nextActiveOrganizationId: null,
		});
	});

	it("prefers the latest persisted active org when the compare-and-swap write loses the race", async () => {
		listMemberships.mockImplementation(async () => [
			createMember("org-1"),
			createMember("org-2", {
				createdAt: new Date("2026-03-20T00:00:00.000Z"),
			}),
		]);
		updateSessionActiveOrganization.mockImplementation(async () => false);
		getSessionActiveOrganization.mockImplementation(async () => "org-2");

		const result = await resolveSessionOrganizationState(
			{
				userId: "user-1",
				session: { id: "session-1", activeOrganizationId: null },
			},
			deps,
		);

		expect(result.activeOrganizationId).toBe("org-2");
		expect(result.membership?.organizationId).toBe("org-2");
		expect(getSessionActiveOrganization).toHaveBeenCalledWith("session-1");
	});
});
