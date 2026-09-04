import { afterEach, describe, expect, test } from "bun:test";
import { inferLocaleWithSource } from "./index";

const g = globalThis as { document?: { cookie: string }; navigator?: unknown };
const originalDocument = g.document;
const originalNavigator = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator",
);

function setNavigator(value: unknown) {
	Object.defineProperty(globalThis, "navigator", {
		value,
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	g.document = originalDocument;
	if (originalNavigator) {
		Object.defineProperty(globalThis, "navigator", originalNavigator);
	}
});

describe("inferLocaleWithSource", () => {
	test("a switcher cookie wins and reports as cookie", () => {
		g.document = { cookie: "other=1; superset_locale=ja" };
		setNavigator({ languages: ["fr-FR", "fr"] });
		expect(inferLocaleWithSource()).toEqual({ locale: "ja", source: "cookie" });
	});

	test("browser languages report as system", () => {
		g.document = { cookie: "" };
		setNavigator({ languages: ["fr-FR", "fr"] });
		expect(inferLocaleWithSource()).toEqual({ locale: "fr", source: "system" });
	});

	test("an unsupported cookie value falls through to the browser", () => {
		g.document = { cookie: "superset_locale=xx" };
		setNavigator({ languages: ["de-DE"] });
		expect(inferLocaleWithSource()).toEqual({ locale: "de", source: "system" });
	});

	test("no preferences at all is the default locale, from the system", () => {
		g.document = { cookie: "" };
		setNavigator({});
		expect(inferLocaleWithSource()).toEqual({ locale: "en", source: "system" });
	});
});
