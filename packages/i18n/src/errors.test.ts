import { describe, expect, test } from "bun:test";
import { errorMessage, rawErrorMessage } from "./errors";
import { initI18n } from "./index";

initI18n();

describe("errorMessage", () => {
	test("resolves a known i18nKey from the catalog", () => {
		const error = {
			message: "This slug is already taken",
			data: { i18nKey: "serverError.organization.slugTaken" },
		};
		expect(errorMessage(error)).toBe("This slug is already taken");
	});

	test("unknown i18nKey falls back to the error message", () => {
		const error = {
			message: "Not yet registered",
			data: { i18nKey: "serverError.notInRegistry" },
		};
		expect(errorMessage(error)).toBe("Not yet registered");
	});

	test("plain errors keep their message", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
	});

	test("thrown strings pass through", () => {
		expect(errorMessage("plain string failure")).toBe("plain string failure");
	});

	test("messageless errors get the generic translated fallback", () => {
		expect(errorMessage({})).toBe("Something went wrong. Please try again.");
		expect(errorMessage(null)).toBe("Something went wrong. Please try again.");
	});

	test("explicit fallback wins over the generic one", () => {
		expect(errorMessage({}, "Saving failed")).toBe("Saving failed");
	});
});

describe("rawErrorMessage", () => {
	test("always returns the untranslated source message", () => {
		expect(rawErrorMessage(new Error("boom"))).toBe("boom");
		expect(rawErrorMessage("thrown string")).toBe("thrown string");
		expect(
			rawErrorMessage({
				message: "This slug is already taken",
				data: { i18nKey: "serverError.organization.slugTaken" },
			}),
		).toBe("This slug is already taken");
		expect(rawErrorMessage(null)).toBe("");
	});
});
