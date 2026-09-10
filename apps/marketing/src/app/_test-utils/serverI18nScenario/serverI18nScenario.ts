// Run in a separate process with --conditions=react-server so Lingui uses its
// real RSC implementation and React cache, rather than mocked hooks/context.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Trans, useLingui } from "@lingui/react";
import { i18n as globalI18n, initI18nAsync } from "@superset/i18n";
import { formatDate, formatNumber } from "@superset/i18n/format";
import {
	getI18nInstance,
	initServerI18n,
	preloadServerLocale,
} from "@superset/i18n/server";
import { createElement, type ReactNode } from "react";

const require = createRequire(import.meta.url);
const { renderToReadableStream } =
	require("next/dist/compiled/react-server-dom-webpack/server.edge") as {
		renderToReadableStream: (
			node: ReactNode,
			manifest: object,
		) => ReadableStream;
	};

await initI18nAsync("en");
await Promise.all([preloadServerLocale("pl"), preloadServerLocale("pl")]);
const english = getI18nInstance("en");
const polish = getI18nInstance("pl");
// This fixture runs without Next's macro transform. Resolve the compiled
// IDs from the real English catalog so we exercise the shipping translations.
function messageId(text: string): string {
	const entry = Object.entries(english.messages).find(
		([, value]) =>
			Array.isArray(value) && value.length === 1 && value[0] === text,
	);
	assert.ok(entry, `Missing compiled message: ${text}`);
	return entry[0];
}
const titleId = messageId("Star History");
const buttonId = messageId("Star on GitHub");
assert.notEqual(english, polish);
assert.equal(polish, getI18nInstance("pl"));

let enteredEnglish!: () => void;
const englishStarted = new Promise<void>((resolve) => {
	enteredEnglish = resolve;
});
let finishEnglish!: () => void;
const englishData = new Promise<void>((resolve) => {
	finishEnglish = resolve;
});

async function Page({ locale }: { locale: "en" | "pl" }) {
	initServerI18n(locale);
	const { i18n } = useLingui();
	if (locale === "en") {
		enteredEnglish();
		await englishData;
	}
	return createElement(
		"main",
		null,
		createElement(Trans, { id: titleId }),
		"|",
		i18n._(buttonId),
		"|",
		formatDate(
			new Date("2026-09-01T00:00:00Z"),
			{ month: "long", timeZone: "UTC" },
			i18n.locale,
		),
		"|",
		formatNumber(1234.5, undefined, i18n.locale),
	);
}

async function render(locale: "en" | "pl") {
	return new Response(
		renderToReadableStream(createElement(Page, { locale }), {}),
	).text();
}

const pendingEnglish = render("en");
await englishStarted;
const polishOutput = await render("pl");
finishEnglish();
const englishOutput = await pendingEnglish;
assert.ok(englishOutput.includes("Star History"));
assert.ok(englishOutput.includes("Star on GitHub"));
assert.ok(englishOutput.includes("September"));
assert.ok(englishOutput.includes("1,234.5"));
assert.ok(!englishOutput.includes("Historia gwiazdek"));
assert.ok(polishOutput.includes("Historia gwiazdek"));
assert.ok(polishOutput.includes("Oznacz gwiazdką na GitHub"));
assert.ok(polishOutput.includes("wrzesień"));
assert.ok(polishOutput.includes("1234,5"));
// A client/global locale change must also leave these server instances alone.
assert.equal(globalI18n.locale, "en");
await initI18nAsync("ja");
// Imperative consumers (metadata and route handlers) keep their captured
// instances too, including after another locale finishes rendering.
assert.equal(english._(titleId), "Star History");
assert.equal(polish._(titleId), "Historia gwiazdek");
assert.equal(english.locale, "en");
assert.equal(polish.locale, "pl");
assert.equal(globalI18n.locale, "ja");
console.log("Concurrent RSC locales remained isolated.");
