import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// completion.ts and the zustand persist stores read the global localStorage;
// give them a working in-memory one before anything imports them.
const backing = new Map<string, string>();
globalThis.localStorage = {
	getItem: (key: string) => backing.get(key) ?? null,
	setItem: (key: string, value: string) => void backing.set(key, value),
	removeItem: (key: string) => void backing.delete(key),
	clear: () => backing.clear(),
	key: (index: number) => [...backing.keys()][index] ?? null,
	get length() {
		return backing.size;
	},
} as Storage;

// Pre-cutoff account: defaults to v1, sees the "Import from v1" row.
const V1_ERA_CREATED_AT = new Date("2026-01-01T00:00:00Z");
// Post-cutoff account: v2-only signup cohort.
const V2_ONLY_CREATED_AT = new Date("2026-08-01T00:00:00Z");

// Mutable session the auth-client mock serves; tests swap the org per case
// because isV1MigrationCompleteAtBoot caches the first read per org.
let activeOrganizationId = "org-none";
let createdAt: Date = V1_ERA_CREATED_AT;

// Spread the real module so files loaded later that import its other exports
// (getAuthToken, ensureFreshJwt, ...) keep working — mock.module replaces the
// module for the whole test process, and file load order varies by platform.
const realAuthClient = await import("renderer/lib/auth-client");
mock.module("renderer/lib/auth-client", () => ({
	...realAuthClient,
	authClient: {
		...realAuthClient.authClient,
		useSession: () => ({
			data: {
				session: { activeOrganizationId },
				user: { createdAt, onboardedAt: new Date() },
			},
		}),
	},
}));
const realEnv = await import("renderer/env.renderer");
mock.module("renderer/env.renderer", () => ({
	...realEnv,
	env: { ...realEnv.env, NODE_ENV: "production" },
}));
mock.module("renderer/lib/analytics", () => ({
	track: () => {},
}));
// Owns electronTrpc queries; irrelevant to what this file asserts.
mock.module("./components/WaitForSetupBeforeAgentSetting", () => ({
	WaitForSetupBeforeAgentSetting: () => null,
}));

const { ExperimentalSettings } = await import("./ExperimentalSettings");
const { markV1MigrationComplete } = await import(
	"renderer/lib/v1-migration/completion"
);

function renderSettings(orgId: string, userCreatedAt: Date) {
	activeOrganizationId = orgId;
	createdAt = userCreatedAt;
	return renderToStaticMarkup(<ExperimentalSettings />);
}

describe("ExperimentalSettings v1/v2 switch", () => {
	test("v1 user without a migration marker sees the toggle and the v1 import", () => {
		const markup = renderSettings("org-v1", V1_ERA_CREATED_AT);
		expect(markup).toContain("Try Superset v2");
		expect(markup).toContain("Import from v1");
	});

	test("migrated (flip-locked) machine hides the dead toggle", () => {
		markV1MigrationComplete("org-flipped");
		const markup = renderSettings("org-flipped", V1_ERA_CREATED_AT);
		expect(markup).not.toContain("Try Superset v2");
	});

	test("migrated machine keeps Import from v1 as the recovery path", () => {
		markV1MigrationComplete("org-flipped-import");
		const markup = renderSettings("org-flipped-import", V1_ERA_CREATED_AT);
		expect(markup).toContain("Import from v1");
	});

	test("v2-only signup without a marker still sees the toggle (opt-out remains real)", () => {
		const markup = renderSettings("org-v2only", V2_ONLY_CREATED_AT);
		expect(markup).toContain("Try Superset v2");
		expect(markup).not.toContain("Import from v1");
	});
});
