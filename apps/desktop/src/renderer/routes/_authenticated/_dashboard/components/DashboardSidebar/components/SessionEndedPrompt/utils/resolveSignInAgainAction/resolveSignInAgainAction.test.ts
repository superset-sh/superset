import { describe, expect, it } from "bun:test";
import { resolveSignInAgainAction } from "./resolveSignInAgainAction";

describe("resolveSignInAgainAction", () => {
	it.each([
		"github",
		"google",
	] as const)("starts the browser sign-in with %s when it was used last", (provider) => {
		for (const isDevelopment of [true, false]) {
			expect(
				resolveSignInAgainAction({ lastMethod: provider, isDevelopment }),
			).toEqual({ type: "provider", provider });
		}
	});

	it("re-runs the dev sign-in in development", () => {
		expect(
			resolveSignInAgainAction({ lastMethod: "dev", isDevelopment: true }),
		).toEqual({ type: "dev" });
	});

	it("never runs the dev sign-in in a production build", () => {
		expect(
			resolveSignInAgainAction({ lastMethod: "dev", isDevelopment: false }),
		).toEqual({ type: "sign-in-page" });
	});

	it("opens the sign-in page when this machine has no last method", () => {
		expect(
			resolveSignInAgainAction({ lastMethod: null, isDevelopment: false }),
		).toEqual({ type: "sign-in-page" });
	});
});
