import { describe, expect, test } from "bun:test";
import { parseRendererEnv } from "./env.renderer.schema";

describe("parseRendererEnv", () => {
	test("treats empty build-time strings as unset in production", () => {
		const env = parseRendererEnv({
			NODE_ENV: "production",
			SUPERSET_PROFILE: "",
			NEXT_PUBLIC_API_URL: "",
			NEXT_PUBLIC_WEB_URL: "",
			NEXT_PUBLIC_MARKETING_URL: "",
			NEXT_PUBLIC_ELECTRIC_URL: "",
			NEXT_PUBLIC_POSTHOG_KEY: "",
			NEXT_PUBLIC_POSTHOG_HOST: "",
			SENTRY_DSN_DESKTOP: "",
			RELAY_URL: "",
		});

		expect(env.SUPERSET_PROFILE).toBeUndefined();
		expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.superset.sh");
		expect(env.NEXT_PUBLIC_WEB_URL).toBe("https://app.superset.sh");
		expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
		expect(env.SENTRY_DSN_DESKTOP).toBeUndefined();
		expect(env.RELAY_URL).toBe("https://relay.superset.sh");
	});

	test("uses local defaults only for the development local profile", () => {
		const env = parseRendererEnv({
			NODE_ENV: "development",
			SUPERSET_PROFILE: "local",
		});

		expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:4641");
		expect(env.NEXT_PUBLIC_WEB_URL).toBe("http://localhost:4640");
		expect(env.NEXT_PUBLIC_ELECTRIC_URL).toBe("https://localhost:4650");
		expect(env.RELAY_URL).toBe("http://localhost:4653");
	});

	test("ignores local profile when it leaks into a production build", () => {
		const env = parseRendererEnv({
			NODE_ENV: "production",
			SUPERSET_PROFILE: "local",
		});

		expect(env.SUPERSET_PROFILE).toBeUndefined();
		expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.superset.sh");
		expect(env.NEXT_PUBLIC_WEB_URL).toBe("https://app.superset.sh");
		expect(env.RELAY_URL).toBe("https://relay.superset.sh");
	});

	test("rejects non-empty invalid profiles", () => {
		expect(() =>
			parseRendererEnv({
				NODE_ENV: "production",
				SUPERSET_PROFILE: "invalid",
			}),
		).toThrow();
	});
});
