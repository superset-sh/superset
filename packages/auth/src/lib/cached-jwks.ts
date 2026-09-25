import type { GenericEndpointContext } from "better-auth";
import type { Jwk } from "better-auth/plugins/jwt";

/**
 * The jwt plugin reads the whole `jwks` table every time it mints a token, and
 * it mints one on every `/get-session` to set the `set-auth-jwt` header. That
 * is a database round trip on every authenticated request in the product for a
 * key set that only changes when a key is created.
 *
 * Disabling the header instead would be cheaper still, but the desktop and
 * mobile clients read it opportunistically to refresh their token
 * (apps/desktop/src/renderer/lib/auth-client.ts, apps/mobile/lib/auth/client.ts),
 * so the header stays and the read gets cached.
 *
 * The TTL is short because the cost of being stale is real but bounded: a key
 * created by another instance is absent from `/jwks` until the cache expires,
 * so tokens signed with it fail verification until then. Creations go through
 * `createJwk` below, which clears this instance's copy immediately.
 */
const JWKS_CACHE_TTL_MS = 60 * 1000;

let cache: { keys: Jwk[]; fetchedAt: number } | null = null;

export function jwksAdapter() {
	return {
		getJwks: async (ctx: GenericEndpointContext): Promise<Jwk[]> => {
			if (cache && Date.now() - cache.fetchedAt < JWKS_CACHE_TTL_MS) {
				return cache.keys;
			}

			const keys = await ctx.context.adapter.findMany<Jwk>({
				model: "jwks",
			});
			cache = { keys, fetchedAt: Date.now() };
			return keys;
		},

		createJwk: async (
			data: Omit<Jwk, "id">,
			ctx: GenericEndpointContext,
		): Promise<Jwk> => {
			const created = await ctx.context.adapter.create<Omit<Jwk, "id">, Jwk>({
				model: "jwks",
				data: { ...data, createdAt: new Date() },
			});
			cache = null;
			return created;
		},
	};
}
