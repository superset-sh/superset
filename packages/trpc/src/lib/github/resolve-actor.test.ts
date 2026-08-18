import { describe, expect, test } from "bun:test";
import { chooseGitHubActor } from "./resolve-actor";

describe("chooseGitHubActor", () => {
	test("bot ignores a connected user", () => {
		expect(
			chooseGitHubActor({ policy: "bot", hasUser: true, userConnected: true }),
		).toBe("app");
	});
	test("user_or_bot uses the user when connected", () => {
		expect(
			chooseGitHubActor({
				policy: "user_or_bot",
				hasUser: true,
				userConnected: true,
			}),
		).toBe("user");
	});
	test("user_or_bot falls back to the app when not connected", () => {
		expect(
			chooseGitHubActor({
				policy: "user_or_bot",
				hasUser: true,
				userConnected: false,
			}),
		).toBe("app");
	});
	test("user_only refuses when not connected", () => {
		expect(
			chooseGitHubActor({
				policy: "user_only",
				hasUser: true,
				userConnected: false,
			}),
		).toBe("refuse");
	});
	test("no user (automation) resolves to the app under every policy", () => {
		for (const policy of ["bot", "user_or_bot", "user_only"] as const) {
			expect(
				chooseGitHubActor({ policy, hasUser: false, userConnected: false }),
			).toBe("app");
		}
	});
});
