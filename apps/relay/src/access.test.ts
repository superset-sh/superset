import { beforeEach, describe, expect, it, mock } from "bun:test";

const checkAccessMock = mock(
	async (_input: {
		hostId: string;
	}): Promise<{
		allowed: boolean;
		paidPlan: boolean;
	}> => ({ allowed: false, paidPlan: false }),
);

mock.module("./api-client", () => ({
	createApiClient: () => ({
		host: { checkAccess: { query: checkAccessMock } },
	}),
}));

const { checkHostAccess } = await import("./access");

const TOKEN = "test-token";

describe("checkHostAccess", () => {
	beforeEach(() => {
		checkAccessMock.mockReset();
	});

	it("returns ok when the user has access on a paid plan", async () => {
		checkAccessMock.mockImplementation(async () => ({
			allowed: true,
			paidPlan: true,
		}));
		const result = await checkHostAccess(TOKEN, "host-paid");
		expect(result).toEqual({ ok: true });
	});

	it("distinguishes paid_plan_required from no_access", async () => {
		checkAccessMock.mockImplementation(async () => ({
			allowed: true,
			paidPlan: false,
		}));
		const result = await checkHostAccess(TOKEN, "host-no-plan");
		expect(result).toEqual({ ok: false, reason: "paid_plan_required" });
	});

	it("returns no_access when the user is not a member of the host", async () => {
		checkAccessMock.mockImplementation(async () => ({
			allowed: false,
			paidPlan: false,
		}));
		const result = await checkHostAccess(TOKEN, "host-no-access");
		expect(result).toEqual({ ok: false, reason: "no_access" });
	});

	it("treats trpc errors as no_access", async () => {
		checkAccessMock.mockImplementation(async () => {
			throw new Error("network down");
		});
		const result = await checkHostAccess(TOKEN, "host-error");
		expect(result).toEqual({ ok: false, reason: "no_access" });
	});
});
