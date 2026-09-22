import { describe, expect, test } from "bun:test";
import { Trans, useLingui } from "@lingui/react";
import { i18n, initI18n } from "@superset/i18n";
import { formatDate, formatList, formatNumber } from "@superset/i18n/format";
import { I18nProvider } from "@superset/i18n/react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";

function FormattedGreeting() {
	const { i18n: requestI18n } = useLingui();
	const locale = requestI18n.locale;
	return (
		<>
			<Trans id="greeting" />|{formatNumber(1234.5, undefined, locale)}|
			{formatDate(
				new Date("2026-09-01T00:00:00Z"),
				{ month: "long", timeZone: "UTC" },
				locale,
			)}
			|{formatList(["A", "B"], undefined, locale)}
		</>
	);
}

describe("server-resolved client translations", () => {
	test("keeps formatted values with their request's language across concurrent renders", async () => {
		initI18n("en");
		const render = async (locale: "fr" | "de", greeting: string) => {
			const stream = await renderToReadableStream(
				<I18nProvider locale={locale} initialMessages={{ greeting }}>
					<FormattedGreeting />
				</I18nProvider>,
			);
			return (await new Response(stream).text()).replaceAll("<!-- -->", "");
		};
		const [french, german] = await Promise.all([
			render("fr", "Bonjour"),
			render("de", "Hallo"),
		]);
		expect(french).toBe("Bonjour|1\u202f234,5|septembre|A et B");
		expect(german).toBe("Hallo|1.234,5|September|A und B");
		expect(i18n.locale).toBe("en");
	});
	test("renders the requested language before effects without changing another request's locale", () => {
		initI18n("en");
		const french = renderToStaticMarkup(
			<I18nProvider locale="fr" initialMessages={{ greeting: "Bonjour" }}>
				<Trans id="greeting" />
			</I18nProvider>,
		);
		const german = renderToStaticMarkup(
			<I18nProvider locale="de" initialMessages={{ greeting: "Hallo" }}>
				<Trans id="greeting" />
			</I18nProvider>,
		);

		expect(french).toBe("Bonjour");
		expect(german).toBe("Hallo");
		expect(i18n.locale).toBe("en");
	});
});
