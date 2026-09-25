import { writeFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost" });
const { act, render, fireEvent, cleanup, waitFor } = await import(
	"@testing-library/react"
);
const { useEffect, useState } = await import("react");
const { I18nProvider, LanguageSwitcher, useFormat } = await import(
	"../../src/react"
);
const { initI18nAsync, i18n } = await import("../../src/index");
let mounts = 0;
function Draft() {
	const [value, setValue] = useState("");
	const { formatNumber, formatDate } = useFormat();
	useEffect(() => {
		mounts++;
	}, []);
	return (
		<>
			<input
				aria-label="Draft"
				value={value}
				onChange={(event) => setValue(event.target.value)}
			/>
			<output>
				{formatNumber(1234.5)}|
				{formatDate(new Date("2026-09-01T00:00:00Z"), {
					month: "long",
					timeZone: "UTC",
				})}
			</output>
		</>
	);
}
function check(condition: boolean, message: string) {
	if (!condition) throw new Error(message);
}
// A cold native launch must not mount an English application while loading.
render(
	<I18nProvider locale="cs" deferUntilReady>
		<Draft />
	</I18nProvider>,
);
check(
	document.querySelector("input") === null,
	"Native children mounted before readiness",
);
await waitFor(() =>
	check(document.querySelector("input") !== null, "Native catalog not ready"),
);
check(
	document.documentElement.lang === "cs",
	"Cold native launch used the wrong locale",
);
check(mounts === 1, "Cold native startup mounted children more than once");
cleanup();
mounts = 0;
await initI18nAsync("en");
await act(async () => {
	render(
		<I18nProvider>
			<Draft />
		</I18nProvider>,
	);
});
const input = document.querySelector("input");
if (!input) throw new Error("Missing draft input");
fireEvent.change(input, { target: { value: "unsaved draft" } });
input.focus();
for (const locale of ["pl", "ja", "zh-CN", "zh-TW", "fr", "en"] as const) {
	await act(async () => {
		await initI18nAsync(locale);
	});
	check(document.querySelector("input") === input, "Input remounted");
	check(input.value === "unsaved draft", "Draft lost");
	check(document.activeElement === input, "Focus lost");
	check(mounts === 1, "Child remounted");
	check(document.documentElement.lang === locale, "Document locale is stale");
	check(
		document.querySelector("output")?.textContent ===
			`${new Intl.NumberFormat(locale).format(1234.5)}|${new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date("2026-09-01T00:00:00Z"))}`,
		"Formatter did not follow locale",
	);
}
cleanup();
await act(async () => {
	render(
		<I18nProvider locale="fr" initialMessages={{ hello: "Bonjour" }}>
			<Draft />
			<LanguageSwitcher label="Language" />
		</I18nProvider>,
	);
});
check(
	document.querySelector("select")?.value === "fr",
	"Switcher ignored snapshot",
);
check(i18n.locale === "en", "Server snapshot mutated the singleton");
check(
	document.documentElement.lang === "fr",
	"Snapshot document locale incorrect",
);
check(
	document.querySelector("output")?.textContent?.includes("septembre") ?? false,
	"Snapshot formatter used global English",
);
cleanup();
if (process.argv[2]) writeFileSync(process.argv[2], "passed");
GlobalRegistrator.unregister();
