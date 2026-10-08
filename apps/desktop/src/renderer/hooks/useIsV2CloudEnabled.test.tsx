import { afterEach, describe, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Pre-cutoff account: defaults to v1 (not in any v2-only signup cohort).
const V1_ERA_CREATED_AT = new Date("2026-01-01T00:00:00Z");
// Signed up after new users defaulted to v2; only an explicit opt-out
// puts this account on v1.
const V2_ERA_CREATED_AT = new Date("2026-08-01T00:00:00Z");

const {
	useIsV1FlipLocked,
	useIsV1FlipLockedFor,
	useIsV2CloudEnabled,
	useIsV2CloudEnabledFor,
	useIsV2OnlyUser,
} = await import("./useIsV2CloudEnabled");
const { renderToStaticMarkup } = await import("react-dom/server");
const { authClient } = await import("renderer/lib/auth-client");
const { markV1MigrationComplete } = await import(
	"renderer/lib/v1-migration/completion"
);
const { useV2LocalOverrideStore } = await import(
	"renderer/stores/v2-local-override"
);
const { act, cleanup, render } = await import("@testing-library/react");

const optInV2Before = useV2LocalOverrideStore.getState().optInV2;

afterEach(() => {
	cleanup();
	useV2LocalOverrideStore.setState({ optInV2: optInV2Before });
	localStorage.clear();
});
interface ProbeProps {
	organizationId: string;
	userCreatedAt?: Date;
	forcedFlipActive?: boolean;
}

function Probe({
	organizationId,
	userCreatedAt = V1_ERA_CREATED_AT,
	forcedFlipActive,
}: ProbeProps) {
	const locked = useIsV1FlipLockedFor({ organizationId, forcedFlipActive });
	const v2 = useIsV2CloudEnabledFor({
		organizationId,
		userCreatedAt,
		forcedFlipActive,
	});
	return <div data-locked={String(locked)} data-v2={String(v2)} />;
}

function readProbe(
	organizationId: string,
	optInV2: boolean | null,
	props: Omit<ProbeProps, "organizationId"> = {},
) {
	useV2LocalOverrideStore.setState({ optInV2 });
	const { container, unmount } = render(
		<Probe organizationId={organizationId} {...props} />,
	);
	const probe = container.firstElementChild;
	const state = {
		locked: probe?.getAttribute("data-locked") === "true",
		v2: probe?.getAttribute("data-v2") === "true",
	};
	unmount();
	return state;
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

	test("forced-flip backstop locks the flip without a marker", () => {
		expect(readProbe("org-forced", false, { forcedFlipActive: true })).toEqual({
			locked: true,
			v2: true,
		});
	});

	test("completion mid-session locks the flip at once; the surface waits for the next launch", () => {
		expect(readProbe("org-mid", null)).toEqual({ locked: false, v2: false });
		markV1MigrationComplete("org-mid");
		expect(readProbe("org-mid", null)).toEqual({ locked: true, v2: false });
	});

	test("completion mid-session freezes the surface: a later opt-in does not flip forward", () => {
		expect(readProbe("org-freeze-in", null)).toEqual({
			locked: false,
			v2: false,
		});
		markV1MigrationComplete("org-freeze-in");
		// The completion event re-renders before anyone can toggle; that render
		// pins the surface.
		expect(readProbe("org-freeze-in", null)).toEqual({
			locked: true,
			v2: false,
		});
		expect(readProbe("org-freeze-in", true)).toEqual({
			locked: true,
			v2: false,
		});
	});

	test("completion mid-session freezes the surface: a later opt-out does not snap back", () => {
		const v2Era = { userCreatedAt: V2_ERA_CREATED_AT };
		expect(readProbe("org-freeze-out", null, v2Era)).toEqual({
			locked: false,
			v2: true,
		});
		markV1MigrationComplete("org-freeze-out");
		expect(readProbe("org-freeze-out", null, v2Era)).toEqual({
			locked: true,
			v2: true,
		});
		expect(readProbe("org-freeze-out", false, v2Era)).toEqual({
			locked: true,
			v2: true,
		});
	});

	test("a mounted hook locks the moment completion fires, without a remount", async () => {
		const { container } = render(<Probe organizationId="org-live" />);
		expect(container.querySelector('[data-locked="true"]')).toBeNull();
		await act(async () => {
			markV1MigrationComplete("org-live");
		});
		expect(container.querySelector('[data-locked="true"]')).not.toBeNull();
		expect(container.querySelector('[data-v2="false"]')).not.toBeNull();
	});

	test("no active org: not locked", () => {
		expect(readProbe("", null).locked).toBe(false);
	});
});

describe("session-reading hooks", () => {
	// Rendered statically: a mounted useSession starts a real get-session
	// request, and better-auth keeps the fetch it saw when the client was made.
	const sessionAtom = authClient.$store.atoms.session as unknown as {
		get: () => object;
		set: (value: object) => void;
	};
	const sessionBefore = sessionAtom.get();

	afterEach(() => {
		sessionAtom.set(sessionBefore);
	});

	function SessionProbe() {
		const v2Only = useIsV2OnlyUser();
		const locked = useIsV1FlipLocked();
		const v2 = useIsV2CloudEnabled();
		return <>{JSON.stringify({ v2Only, locked, v2 })}</>;
	}

	function readSessionProbe(activeOrganizationId: string, createdAt: Date) {
		sessionAtom.set({
			...sessionBefore,
			data: { session: { activeOrganizationId }, user: { createdAt } },
			isPending: false,
		});
		return JSON.parse(
			renderToStaticMarkup(<SessionProbe />).replaceAll("&quot;", '"'),
		);
	}

	test("take the signup cohort from the session user", () => {
		expect(readSessionProbe("org-session-v1", V1_ERA_CREATED_AT)).toEqual({
			v2Only: false,
			locked: false,
			v2: false,
		});
		expect(readSessionProbe("org-session-v2", V2_ERA_CREATED_AT)).toEqual({
			v2Only: true,
			locked: false,
			v2: true,
		});
	});

	test("take the migration marker from the session's active organization", () => {
		markV1MigrationComplete("org-session-marked");
		expect(readSessionProbe("org-session-marked", V1_ERA_CREATED_AT)).toEqual({
			v2Only: false,
			locked: true,
			v2: true,
		});
	});
});
