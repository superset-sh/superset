import { beforeEach, expect, mock, test } from "bun:test";
import { COMPANY } from "@superset/shared/constants";
import { type ComponentType, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GATED_FEATURES } from "renderer/components/Paywall/constants";

let paid = true;
let ready = true;
let remoteEnabled = false;
let remoteLoading = false;
let remotePending = false;
let flags: string[] | undefined = [];
let enabled: boolean | undefined = true;
mock.module("posthog-js/react", () => ({
	useActiveFeatureFlags: () => flags,
	useFeatureFlagEnabled: () => enabled,
}));
mock.module("renderer/components/Redirect", () => ({
	Redirect: ({ to }: { to: string }) => createElement("span", null, to),
}));
mock.module("renderer/components/Paywall", () => ({
	GATED_FEATURES,
	usePaywall: () => ({
		hasAccess: () => paid,
		isReady: ready,
		gateFeature: () => {},
	}),
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		useUtils: () => ({}),
		settings: {
			getExposeHostServiceViaRelay: {
				useQuery: () => ({ data: remoteEnabled, isLoading: remoteLoading }),
			},
			setExposeHostServiceViaRelay: {
				useMutation: () => ({ isPending: remotePending }),
			},
		},
	},
}));
const { MobileSettings } = await import("../MobileSettings");
const { Route } = await import("../../../page");
const MobilePage = Route.options.component as ComponentType;
beforeEach(() => {
	flags = [];
	enabled = true;
	paid = true;
	ready = true;
	remoteEnabled = false;
	remoteLoading = false;
	remotePending = false;
});
test("shows the download QR and remote access switch for paid users", () => {
	const html = renderToStaticMarkup(<MobileSettings />);
	expect(html).toContain("Scan to download Superset for iPhone");
	expect(html).toContain('id="mobile-remote-access"');
	expect(html).toContain('aria-checked="false"');
	expect(html.match(/target="_blank"/g)).toHaveLength(1);
	expect(html).toContain(`${COMPANY.DOCS_URL}/remote-access`);
});
test("withholds QR and remote access switch from free and unresolved plans", () => {
	paid = false;
	let html = renderToStaticMarkup(<MobileSettings />);
	expect(html).toContain("Upgrade to Pro");
	expect(html).not.toContain("Scan to download Superset for iPhone");
	expect(html).not.toContain('id="mobile-remote-access"');
	paid = true;
	ready = false;
	html = renderToStaticMarkup(<MobileSettings />);
	expect(html).not.toContain("Scan to download Superset for iPhone");
	expect(html).not.toContain('id="mobile-remote-access"');
});
test("reflects the saved remote access state and disables the switch while busy", () => {
	remoteEnabled = true;
	expect(renderToStaticMarkup(<MobileSettings />)).toContain(
		'aria-checked="true"',
	);
	remoteLoading = true;
	expect(renderToStaticMarkup(<MobileSettings />)).toContain('disabled=""');
	remoteLoading = false;
	remotePending = true;
	expect(renderToStaticMarkup(<MobileSettings />)).toContain('disabled=""');
});

test("mobile route waits for flags, then redirects for disabled or omitted flags", () => {
	flags = undefined;
	enabled = undefined;
	expect(renderToStaticMarkup(<MobilePage />)).toBe("");
	flags = [];
	expect(renderToStaticMarkup(<MobilePage />)).toContain("/settings/account");
	enabled = false;
	expect(renderToStaticMarkup(<MobilePage />)).toContain("/settings/account");
	enabled = true;
	expect(renderToStaticMarkup(<MobilePage />)).toContain(
		"Install on your iPhone",
	);
});
