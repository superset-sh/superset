import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// completion.ts and the zustand persist store read the global localStorage;
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

// Pre-cutoff account: defaults to v1 (not in any v2-only signup cohort).
const V1_ERA_CREATED_AT = new Date("2026-01-01T00:00:00Z");

// Mutable session the auth-client mock serves; tests swap the org per case
// because isV1MigrationCompleteAtBoot caches the first read per org.
let activeOrganizationId = "org-none";
const createdAt: Date = V1_ERA_CREATED_AT;
// renderToStaticMarkup reads zustand's initial state, not live setState, so
// the override store is mocked with a mutable value instead.
let optInV2: boolean | null = null;

mock.module("renderer/stores/v2-local-override", () => ({
	useV2LocalOverrideStore: <T,>(
		selector: (state: {
			optInV2: boolean | null;
			setOptInV2: (value: boolean) => void;
		}) => T,
	): T => selector({ optInV2, setOptInV2: () => {} }),
}));
mock.module("renderer/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: {
				session: { activeOrganizationId },
				user: { createdAt, onboardedAt: new Date() },
			},
		}),
	},
}));
mock.module("renderer/env.renderer", () => ({
	env: { NODE_ENV: "production" },
}));

const { useIsV1FlipLocked, useIsV2CloudEnabled } = await import(
	"./useIsV2CloudEnabled"
);
const { markV1MigrationComplete } = await import(
	"renderer/lib/v1-migration/completion"
);

function Probe() {
	const locked = useIsV1FlipLocked();
	const v2 = useIsV2CloudEnabled();
	return <div data-locked={String(locked)} data-v2={String(v2)} />;
}

function readProbe(orgId: string, optIn: boolean | null) {
	activeOrganizationId = orgId;
	optInV2 = optIn;
	const markup = renderToStaticMarkup(<Probe />);
	return {
		locked: markup.includes('data-locked="true"'),
		v2: markup.includes('data-v2="true"'),
	};
}

describe("useIsV1FlipLocked", () => {
	test("unlocked v1-era user without a migration marker stays on v1", () => {
		expect(readProbe("org-plain", null)).toEqual({ locked: false, v2: false });
	});

	test("migration marker locks the flip", () => {
		markV1MigrationComplete("org-marked");
		expect(readProbe("org-marked", null)).toEqual({ locked: true, v2: true });
	});

	test("marker beats an explicit opt-out: locked machines cannot return to v1", () => {
		markV1MigrationComplete("org-optout");
		expect(readProbe("org-optout", false)).toEqual({ locked: true, v2: true });
	});

	test("plain opt-in to v2 does not lock the flip", () => {
		expect(readProbe("org-optin", true)).toEqual({ locked: false, v2: true });
	});

	test("no active org: not locked", () => {
		// Guards the `!organizationId → false` path in the marker read.
		activeOrganizationId = "";
		optInV2 = null;
		const markup = renderToStaticMarkup(<Probe />);
		expect(markup.includes('data-locked="true"')).toBe(false);
	});
});
