import { afterAll, describe, expect, it } from "bun:test";

const originalEnv = { ...process.env };

const requiredEnv = {
	ORGANIZATION_ID: "00000000-0000-4000-8000-000000000000",
	HOST_DB_PATH: "/tmp/superset-host-test.db",
	HOST_MIGRATIONS_FOLDER: "/tmp/superset-host-migrations",
	AUTH_TOKEN: "access-token",
	SUPERSET_API_URL: "https://api.example.com",
} satisfies Record<string, string>;

function restoreOriginalEnv(): void {
	for (const key of Object.keys(process.env)) {
		delete process.env[key];
	}
	Object.assign(process.env, originalEnv);
}

function setEnv(overrides: Record<string, string | undefined>): void {
	restoreOriginalEnv();
	Object.assign(process.env, requiredEnv);
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

async function loadEnv(suffix: string): Promise<typeof import("./env").env> {
	const module = (await import(`./env.ts?${suffix}`)) as typeof import("./env");
	return module.env;
}

afterAll(() => {
	restoreOriginalEnv();
});

describe("env", () => {
	it("parses SUPERSET_AUTH_CONFIG_PATH while keeping AUTH_TOKEN required", async () => {
		const configPath = "/tmp/superset/config.json";
		setEnv({
			AUTH_TOKEN: "bootstrap-access-token",
			SUPERSET_AUTH_CONFIG_PATH: configPath,
		});

		const env = await loadEnv("with-auth-config-path");

		expect(env.AUTH_TOKEN).toBe("bootstrap-access-token");
		expect(env.SUPERSET_AUTH_CONFIG_PATH).toBe(configPath);
	});

	it("does not require SUPERSET_AUTH_CONFIG_PATH", async () => {
		setEnv({ SUPERSET_AUTH_CONFIG_PATH: undefined });

		const env = await loadEnv("without-auth-config-path");

		expect(env.AUTH_TOKEN).toBe("access-token");
		expect(env.SUPERSET_AUTH_CONFIG_PATH).toBeUndefined();
	});
});
