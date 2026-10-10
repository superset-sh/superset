import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TRPCError } from "@trpc/server";
import {
	ConfigFileSessionTokenSource,
	JwtApiAuthProvider,
} from "../../../providers/auth";
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
		};
	};

	it("refreshes the expired OAuth token of a host from `superset start`", async () => {
		const fresh = jwtExpiringIn(3600);
		const tokenEndpoint = Bun.serve({
			port: 0,
			fetch: () =>
				Response.json({
					access_token: fresh,
					refresh_token: "rt_next",
					expires_in: 3600,
				}),
		});
		const dir = mkdtempSync(join(tmpdir(), "host-api-token-"));
		try {
			const configPath = join(dir, "config.json");
			writeFileSync(
				configPath,
				JSON.stringify({
					auth: {
						accessToken: jwtExpiringIn(-60),
						refreshToken: "rt_stored",
						expiresAt: Date.now() - 60_000,
					},
				}),
			);
			const apiUrl = `http://127.0.0.1:${tokenEndpoint.port}`;
			const source = new ConfigFileSessionTokenSource({ configPath, apiUrl });
			const apiAuth = new JwtApiAuthProvider({
				getSessionToken: () => source.getSessionToken(),
				onInvalidateCache: () => source.invalidateCache(),
				apiUrl,
			});

			const caller = callerFor({ isLocalCaller: true, apiAuth });

			expect(await caller.apiToken()).toEqual({ token: fresh });
		} finally {
			tokenEndpoint.stop(true);
			rmSync(dir, { recursive: true, force: true });
		}
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
