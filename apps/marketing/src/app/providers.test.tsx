import { describe, expect, test } from "bun:test";
import { Trans } from "@lingui/react";
import { i18n, initI18n } from "@superset/i18n";
import { I18nProvider } from "@superset/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";

describe("server-resolved client translations", () => {
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
