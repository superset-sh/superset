import { beforeEach, expect, mock, test } from "bun:test";
import { COMPANY } from "@superset/shared/constants";
import { type ComponentType, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GATED_FEATURES } from "renderer/components/Paywall/constants";

const router = await import("@tanstack/react-router");
let paid = true;
let ready = true;
let tried = 0;
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
mock.module("renderer/stores/getting-started", () => ({
	useGettingStartedStore: () => ({ tried, markTried: () => {} }),
}));
mock.module("@tanstack/react-router", () => ({
	...router,
	Link: ({ children, to }: { children: ReactNode; to: string }) =>
		createElement("a", { href: to }, children),
}));
const { MobileSettings } = await import("../MobileSettings");
const { Route } = await import("../../../page");
const MobilePage = Route.options.component as ComponentType;
beforeEach(() => {
	flags = [];
	enabled = true;
	paid = true;
	ready = true;
	tried = 0;
});
test("shows the official download QR and setup confirmation for paid users", () => {
	const html = renderToStaticMarkup(<MobileSettings />);
	expect(html).toContain("Scan to download Superset for iPhone");
	expect(html).toContain("https://apps.apple.com/app/id6788926383");
	expect(html).toContain("/settings/security");
	expect(html).toContain(`${COMPANY.MARKETING_URL}/mobile`);
	expect(html).toContain(`${COMPANY.DOCS_URL}/remote-access`);
	expect(html).toContain("signed in on my phone");
});
test("withholds QR and confirmation from free and unresolved plans", () => {
	paid = false;
	let html = renderToStaticMarkup(<MobileSettings />);
	expect(html).toContain("Upgrade to Pro");
	expect(html).not.toContain("https://apps.apple.com/app/id6788926383");
	expect(html).not.toContain("signed in on my phone");
	paid = true;
	ready = false;
	html = renderToStaticMarkup(<MobileSettings />);
	expect(html).not.toContain("https://apps.apple.com/app/id6788926383");
	expect(html).not.toContain("signed in on my phone");
});
test("shows confirmed setup only after explicit mobile confirmation", () => {
	tried = 1;
	expect(renderToStaticMarkup(<MobileSettings />)).toContain(
		"Mobile setup confirmed",
	);
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
	expect(renderToStaticMarkup(<MobilePage />)).toContain("Scan to get the app");
});
