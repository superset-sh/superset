import { describe, expect, it, mock } from "bun:test";
import type { ApiAuthProvider } from "../providers/auth";
import { SESSION_EXPIRED_HINT } from "../providers/auth/hint";
import type { HostServiceContext } from "../types";
import { protectedProcedure, publicProcedure, router } from "./index";

function createContext(authProvider: ApiAuthProvider): HostServiceContext {
	return {
		isAuthenticated: true,
		authProvider,
	} as unknown as HostServiceContext;
}

function createAuthProvider(expired: boolean): ApiAuthProvider {
	return {
		getHeaders: mock(async () => {
			throw new Error("middleware must not refresh credentials");
		}),
		invalidateCache: mock(() => {}),
		isInAnyExpiredState: mock(() => expired),
	};
}

describe("auth expired tRPC middleware", () => {
	it("short-circuits expired_permanent protected procedures without invoking the resolver", async () => {
		const resolver = mock(() => "resolved");
		const authProvider = createAuthProvider(true);
		const testRouter = router({
			secured: protectedProcedure.query(() => resolver()),
			public: publicProcedure.query(() => "public"),
		});
		const caller = testRouter.createCaller(createContext(authProvider));

		await expect(caller.secured()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: SESSION_EXPIRED_HINT,
		});
		await expect(caller.public()).resolves.toBe("public");
		expect(resolver).not.toHaveBeenCalled();
		expect(authProvider.getHeaders).not.toHaveBeenCalled();
	});

	it("short-circuits expired_transient protected procedures without invoking the resolver", async () => {
		const resolver = mock(() => "resolved");
		const authProvider = createAuthProvider(true);
		const testRouter = router({
			secured: protectedProcedure.query(() => resolver()),
		});
		const caller = testRouter.createCaller(createContext(authProvider));

		await expect(caller.secured()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: SESSION_EXPIRED_HINT,
		});
		expect(resolver).not.toHaveBeenCalled();
		expect(authProvider.getHeaders).not.toHaveBeenCalled();
	});

	it("invokes protected resolvers normally when auth state is healthy", async () => {
		const resolver = mock(() => "resolved");
		const authProvider = createAuthProvider(false);
		const testRouter = router({
			secured: protectedProcedure.query(() => resolver()),
		});
		const caller = testRouter.createCaller(createContext(authProvider));

		await expect(caller.secured()).resolves.toBe("resolved");
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(authProvider.getHeaders).not.toHaveBeenCalled();
	});
});
