import { describe, expect, it } from "bun:test";
import type { AuthContext } from "./auth";
import { canProxyHostTrpcPath } from "./procedure-access";

const memberAuth: AuthContext = {
	sub: "user-1",
	email: "member@example.com",
	organizationIds: ["org-1"],
};
const hostId = "org-1:host-1";

describe("canProxyHostTrpcPath", () => {
	it("allows normal host procedures for ordinary host members", () => {
		expect(canProxyHostTrpcPath(memberAuth, hostId, "/trpc/host.info")).toBe(
			true,
		);
		expect(
			canProxyHostTrpcPath(memberAuth, hostId, "/trpc/workspaces.list?batch=1"),
		).toBe(true);
	});

	it.each([
		"/trpc/host.update.start",
		"/trpc/host.update.start?batch=1",
		"/trpc/host.info,host.update.start?batch=1",
		"/trpc/host.info%2Chost.update.start?batch=1",
		"/trpc/host.info%252Chost.update.start?batch=1",
		"/trpc/host%252Eupdate%252Estart",
	])("rejects unscoped update path %s", (path) => {
		expect(canProxyHostTrpcPath(memberAuth, hostId, path)).toBe(false);
	});

	it("allows the server-minted host-update scope", () => {
		expect(
			canProxyHostTrpcPath(
				{
					...memberAuth,
					scope: "host-update",
					runId: `host-update:${hostId}`,
				},
				hostId,
				"/trpc/host.update.start",
			),
		).toBe(true);
	});

	it("does not accept unrelated server scopes", () => {
		expect(
			canProxyHostTrpcPath(
				{
					...memberAuth,
					scope: "automation-run",
					runId: `host-update:${hostId}`,
				},
				hostId,
				"/trpc/host.update.start",
			),
		).toBe(false);
	});

	it("does not allow a host-update token on another host", () => {
		expect(
			canProxyHostTrpcPath(
				{
					...memberAuth,
					scope: "host-update",
					runId: `host-update:${hostId}`,
				},
				"org-1:host-2",
				"/trpc/host.update.start",
			),
		).toBe(false);
	});
});
