import { describe, expect, test } from "bun:test";
import { clampDesignModePayload } from "./design-mode-payload";

function validRawPayload(): Record<string, unknown> {
	return {
		page: {
			sanitizedUrl: "http://localhost:3000/dashboard",
			title: "Dashboard",
			viewportWidth: 1280,
			viewportHeight: 800,
			scrollX: 0,
			scrollY: 120,
			devicePixelRatio: 2,
		},
		target: {
			tagName: "button",
			selector: "button.save",
			elementPath: "#app > .toolbar > button.save",
			cssClasses: "save primary",
			reactComponents: "<SaveButton>",
			sourceFile: "src/components/SaveButton.tsx:12",
			textSnippet: "Save changes",
			htmlSnippet: '<button class="save">Save changes</button>',
			attributes: { class: "save primary", type: "submit" },
			accessibility: {
				role: "button",
				accessibleName: "Save changes",
				ariaLabel: null,
			},
			rectViewport: { x: 10, y: 20, width: 100, height: 32 },
			rectPage: { x: 10, y: 140, width: 100, height: 32 },
			computedStyles: { display: "flex", color: "rgb(0, 0, 0)" },
		},
		nearbyText: ["Cancel"],
		ancestorPath: ["div", "main"],
	};
}

describe("clampDesignModePayload", () => {
	test("rejects structurally invalid payloads", () => {
		expect(clampDesignModePayload(null)).toBeNull();
		expect(clampDesignModePayload("string")).toBeNull();
		expect(clampDesignModePayload({})).toBeNull();
		expect(clampDesignModePayload({ page: {} })).toBeNull();
		expect(clampDesignModePayload({ page: {}, target: "nope" })).toBeNull();
	});

	test("passes a well-formed payload through", () => {
		const payload = clampDesignModePayload(validRawPayload());
		expect(payload).not.toBeNull();
		expect(payload?.target.tagName).toBe("button");
		expect(payload?.target.selector).toBe("button.save");
		expect(payload?.target.sourceFile).toBe("src/components/SaveButton.tsx:12");
		expect(payload?.page.sanitizedUrl).toBe("http://localhost:3000/dashboard");
		expect(payload?.nearbyText).toEqual(["Cancel"]);
		// The screenshot never crosses this boundary; it's captured separately.
		expect(payload?.screenshot).toBeNull();
	});

	test("strips query strings and non-http schemes from URLs", () => {
		const raw = validRawPayload();
		(raw.page as Record<string, unknown>).sanitizedUrl =
			"https://example.com/path?access_token=abc#frag";
		let payload = clampDesignModePayload(raw);
		expect(payload?.page.sanitizedUrl).toBe("https://example.com/path");

		(raw.page as Record<string, unknown>).sanitizedUrl = "javascript:alert(1)";
		payload = clampDesignModePayload(raw);
		expect(payload?.page.sanitizedUrl).toBe("");
	});

	test("drops non-allowlisted attributes and redacts secret values", () => {
		const raw = validRawPayload();
		(raw.target as Record<string, unknown>).attributes = {
			onclick: "steal()",
			"data-session": "x",
			href: "https://example.com/cb?client_secret=zzz",
			title: "my password is hunter2",
			"aria-label": "Save",
		};
		const payload = clampDesignModePayload(raw);
		expect(payload?.target.attributes.onclick).toBeUndefined();
		expect(payload?.target.attributes["data-session"]).toBeUndefined();
		// The whole href contains a secret pattern → redacted before URL cleanup.
		expect(payload?.target.attributes.href).toBe("[redacted]");
		expect(payload?.target.attributes.title).toBe("[redacted]");
		expect(payload?.target.attributes["aria-label"]).toBe("Save");
	});

	test("clamps oversized fields to their budgets", () => {
		const raw = validRawPayload();
		(raw.target as Record<string, unknown>).htmlSnippet = "x".repeat(10_000);
		(raw.nearbyText as string[]) = Array.from({ length: 50 }, () => "text");
		const payload = clampDesignModePayload(raw);
		expect(payload?.target.htmlSnippet.length).toBeLessThanOrEqual(
			4096 + " (truncated)".length,
		);
		expect(payload?.target.htmlSnippet.endsWith("(truncated)")).toBe(true);
		expect(payload?.nearbyText).toHaveLength(10);
	});

	test("replaces non-finite numbers with fallbacks", () => {
		const raw = validRawPayload();
		(raw.target as Record<string, unknown>).rectViewport = {
			x: Number.NaN,
			y: "10",
			width: Number.POSITIVE_INFINITY,
			height: 32,
		};
		const payload = clampDesignModePayload(raw);
		expect(payload?.target.rectViewport).toEqual({
			x: 0,
			y: 0,
			width: 0,
			height: 32,
		});
	});

	test("redacts secret-bearing metadata strings", () => {
		const raw = validRawPayload();
		(raw.target as Record<string, unknown>).cssClasses =
			"btn api_key-widget primary";
		(raw.target as Record<string, unknown>).reactProps =
			'token="abc" password="hunter2"';
		const payload = clampDesignModePayload(raw);
		expect(payload?.target.cssClasses).toBe("[redacted]");
		expect(payload?.target.reactProps).toBe("[redacted]");
	});
});
