import { describe, expect, it } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { hostRouter } from "./host";

const apiAuth = {
	getHeaders: async () => ({ Authorization: "Bearer owner-jwt" }),
	invalidateCache: () => {},
};

const callerFor = (context: Partial<HostServiceContext>) =>
	hostRouter.createCaller({
		isAuthenticated: true,
		apiAuth,
		...context,
	} as HostServiceContext);

describe("host.apiToken", () => {
	it("gives a caller on this machine the token the host uses", async () => {
		const caller = callerFor({ isLocalCaller: true });
		expect(await caller.apiToken()).toEqual({ token: "owner-jwt" });
	});

	it.each([
		["through the relay", false],
		["of unknown origin", undefined],
	])("refuses a caller %s", async (_name, isLocalCaller) => {
		const error = (await callerFor({ isLocalCaller })
			.apiToken()
			.catch((thrown: unknown) => thrown)) as TRPCError;
		expect(error.code).toBe("FORBIDDEN");
	});
});

describe("host.apiToken with a token near expiry", () => {
	const jwtExpiringIn = (seconds: number) =>
		[
			"header",
			Buffer.from(
				JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }),
			).toString("base64url"),
			"signature",
		].join(".");

	const sourceOf = (tokens: string[]) => {
		let invalidated = 0;
		return {
			apiAuth: {
				getHeaders: async () => ({
					Authorization: `Bearer ${tokens[Math.min(invalidated, tokens.length - 1)]}`,
				}),
				invalidateCache: () => {
					invalidated++;
				},
			},
			invalidations: () => invalidated,
		};
	};

	it("refreshes an expired token before giving it out", async () => {
		const fresh = jwtExpiringIn(3600);
		const source = sourceOf([jwtExpiringIn(-60), fresh]);
		const caller = callerFor({ isLocalCaller: true, apiAuth: source.apiAuth });
		expect(await caller.apiToken()).toEqual({ token: fresh });
		expect(source.invalidations()).toBe(1);
	});

	it("refuses when the refreshed token still expires within minutes", async () => {
		const source = sourceOf([jwtExpiringIn(-60), jwtExpiringIn(30)]);
		const error = (await callerFor({
			isLocalCaller: true,
			apiAuth: source.apiAuth,
		})
			.apiToken()
			.catch((thrown: unknown) => thrown)) as TRPCError;
		expect(error.code).toBe("PRECONDITION_FAILED");
	});
});
