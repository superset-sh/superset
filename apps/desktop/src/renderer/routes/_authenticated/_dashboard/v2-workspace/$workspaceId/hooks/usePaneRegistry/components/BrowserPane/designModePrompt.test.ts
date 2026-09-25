import { describe, expect, test } from "bun:test";
import type { DesignModePayload } from "shared/browser-design-mode";
import {
	buildDesignModePrompt,
	describeDesignModeElement,
	formatDesignModeContextMarkdown,
} from "./designModePrompt";

function payload(
	overrides?: Partial<DesignModePayload["target"]>,
): DesignModePayload {
	return {
		page: {
			sanitizedUrl: "http://localhost:3000/dashboard",
			title: "Dashboard",
			viewportWidth: 1280,
			viewportHeight: 800,
			scrollX: 0,
			scrollY: 0,
			devicePixelRatio: 2,
		},
		target: {
			tagName: "button",
			selector: "button.save",
			elementPath: "#app > button.save",
			cssClasses: "save",
			reactComponents: "<SaveButton>",
			reactProps: 'variant="primary" disabled=false onClick=fn',
			sourceFile: "src/SaveButton.tsx:12",
			textSnippet: "Save changes",
			htmlSnippet: '<button class="save">Save```changes</button>',
			attributes: {},
			accessibility: {
				role: "button",
				accessibleName: "Save changes",
				ariaLabel: null,
			},
			rectViewport: { x: 10, y: 20, width: 100, height: 32 },
			rectPage: { x: 10, y: 20, width: 100, height: 32 },
			computedStyles: {
				display: "flex",
				position: "static",
				width: "100px",
				height: "32px",
				margin: "0px",
				padding: "8px",
				color: "rgb(255, 255, 255)",
				backgroundColor: "rgba(0, 0, 0, 0)",
				border: "",
				borderRadius: "6px",
				fontFamily: "Inter",
				fontSize: "13px",
				fontWeight: "500",
				lineHeight: "normal",
				textAlign: "auto",
				zIndex: "auto",
			},
			...overrides,
		},
		nearbyText: ["Cancel"],
		ancestorPath: ["div", "main"],
		screenshot: null,
	};
}

describe("describeDesignModeElement", () => {
	test("prefers the accessible name and includes React components", () => {
		expect(describeDesignModeElement(payload())).toBe(
			'<SaveButton> <button> "Save changes"',
		);
	});

	test("falls back to the bare tag when nothing else is known", () => {
		const p = payload({
			reactComponents: null,
			textSnippet: "",
			accessibility: { role: null, accessibleName: null, ariaLabel: null },
		});
		expect(describeDesignModeElement(p)).toBe("<button>");
	});
});

describe("buildDesignModePrompt", () => {
	test("stays on one line and references the staged files", () => {
		const prompt = buildDesignModePrompt({
			payload: payload(),
			comment: "Make this\nprimary blue",
			contextPath: ".superset/attachments/design-1.md",
			screenshotPath: ".superset/attachments/design-1.png",
		});
		expect(prompt).not.toContain("\n");
		expect(prompt).toContain("Make this primary blue");
		expect(prompt).toContain(".superset/attachments/design-1.md");
		expect(prompt).toContain(".superset/attachments/design-1.png");
		expect(prompt).toContain("source src/SaveButton.tsx:12");
	});

	test("omits the screenshot clause when none was captured", () => {
		const prompt = buildDesignModePrompt({
			payload: payload(),
			comment: "fix",
			contextPath: ".superset/attachments/design-1.md",
			screenshotPath: null,
		});
		expect(prompt).not.toContain("screenshot");
	});
});

describe("formatDesignModeContextMarkdown", () => {
	test("includes feedback, selector, styles, and fenced HTML", () => {
		const md = formatDesignModeContextMarkdown(payload(), "Make it blue");
		expect(md).toContain("**Feedback:** Make it blue");
		expect(md).toContain("**Selector:** `button.save`");
		expect(md).toContain(
			'**React props:** `variant="primary" disabled=false onClick=fn`',
		);
		expect(md).toContain("untrusted data");
		expect(md).toContain("- padding: 8px");
		// Noise values are filtered.
		expect(md).not.toContain("position: static");
		expect(md).not.toContain("rgba(0, 0, 0, 0)");
		// The fence is longer than any backtick run inside the HTML.
		expect(md).toContain("````html");
	});

	test("omits the feedback line for an empty comment", () => {
		const md = formatDesignModeContextMarkdown(payload(), "");
		expect(md).not.toContain("**Feedback:**");
	});

	test("includes live-pane verify commands only when the pane is given", () => {
		const md = formatDesignModeContextMarkdown(payload(), "fix", {
			workspaceId: "ws-1",
			paneId: "pane-1",
		});
		expect(md).toContain("## Live page");
		expect(md).toContain(
			"superset browser screenshot --workspace ws-1 --pane pane-1",
		);
		expect(formatDesignModeContextMarkdown(payload(), "fix")).not.toContain(
			"## Live page",
		);
	});
});
