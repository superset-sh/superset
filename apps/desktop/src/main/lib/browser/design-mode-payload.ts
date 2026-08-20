import {
	DESIGN_MODE_BUDGET,
	DESIGN_MODE_SAFE_ATTRIBUTE_NAMES,
	DESIGN_MODE_SECRET_PATTERNS,
	type DesignModePayload,
	type DesignModeRect,
} from "shared/browser-design-mode";

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "file:"]);

function clampStr(s: unknown, max: number): string {
	const str = typeof s === "string" ? s : "";
	if (str.length <= max) return str;
	return `${str.slice(0, max)} (truncated)`;
}

function safeNum(n: unknown, fallback = 0): number {
	return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function containsSecret(value: string): boolean {
	const lower = value.toLowerCase();
	return DESIGN_MODE_SECRET_PATTERNS.some((p) => lower.includes(p));
}

function sanitizeUrl(rawUrl: unknown): string {
	const str = typeof rawUrl === "string" ? rawUrl : "";
	if (!str) return "";
	try {
		const url = new URL(str);
		if (url.protocol === "about:") {
			return url.toString() === "about:blank" ? "about:blank" : "";
		}
		if (!SAFE_URL_PROTOCOLS.has(url.protocol)) return "";
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		// Raw passthrough on parse failure could preserve javascript: URIs.
		return "";
	}
}

function safeMetadataStr(value: unknown, max: number): string {
	const str = clampStr(value, max);
	return str && containsSecret(str) ? "[redacted]" : str;
}

function safeAttributes(attrs: unknown): Record<string, string> {
	if (!attrs || typeof attrs !== "object") return {};
	const filtered: Record<string, string> = {};
	for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
		const name = key.toLowerCase();
		if (
			!name.startsWith("aria-") &&
			!DESIGN_MODE_SAFE_ATTRIBUTE_NAMES.has(name)
		)
			continue;
		const strValue = clampStr(value, 2000);
		if (containsSecret(strValue)) {
			filtered[name] = "[redacted]";
		} else if (
			(name === "href" || name === "src" || name === "action") &&
			strValue
		) {
			filtered[name] = sanitizeUrl(strValue);
		} else if (name === "class") {
			filtered[name] = clampStr(value, 200);
		} else {
			filtered[name] = clampStr(value, 500);
		}
	}
	return filtered;
}

function safeRect(r: unknown): DesignModeRect {
	if (!r || typeof r !== "object") return { x: 0, y: 0, width: 0, height: 0 };
	const rect = r as Record<string, unknown>;
	return {
		x: safeNum(rect.x),
		y: safeNum(rect.y),
		width: safeNum(rect.width),
		height: safeNum(rect.height),
	};
}

function clampStrArray(
	arr: unknown,
	maxEntries: number,
	maxEntryLength: number,
): string[] {
	const items = Array.isArray(arr) ? arr : [];
	return items
		.slice(0, maxEntries)
		.map((item) => safeMetadataStr(item, maxEntryLength))
		.filter(Boolean);
}

/**
 * Re-validate and clamp a design-mode payload before it reaches the renderer.
 * The guest page is completely untrusted: even if the injected extraction
 * script is subverted, whatever crosses this boundary respects the documented
 * budgets, attribute allowlist, secret redaction, and URL sanitization.
 *
 * Returns null when the payload is structurally invalid.
 */
export function clampDesignModePayload(raw: unknown): DesignModePayload | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;
	if (!obj.page || typeof obj.page !== "object") return null;
	if (!obj.target || typeof obj.target !== "object") return null;

	const page = obj.page as Record<string, unknown>;
	const target = obj.target as Record<string, unknown>;
	const accessibility = target.accessibility as
		| Record<string, unknown>
		| null
		| undefined;
	const computedStyles = target.computedStyles as
		| Record<string, unknown>
		| null
		| undefined;

	return {
		page: {
			sanitizedUrl: sanitizeUrl(page.sanitizedUrl),
			title: safeMetadataStr(page.title, 500),
			viewportWidth: safeNum(page.viewportWidth),
			viewportHeight: safeNum(page.viewportHeight),
			scrollX: safeNum(page.scrollX),
			scrollY: safeNum(page.scrollY),
			devicePixelRatio: safeNum(page.devicePixelRatio, 1),
		},
		target: {
			tagName: clampStr(target.tagName, 50),
			selector: clampStr(target.selector, DESIGN_MODE_BUDGET.selectorMaxLength),
			elementPath: safeMetadataStr(
				target.elementPath,
				DESIGN_MODE_BUDGET.pathMaxLength,
			),
			cssClasses: safeMetadataStr(
				target.cssClasses,
				DESIGN_MODE_BUDGET.cssClassesMaxLength,
			),
			reactComponents:
				safeMetadataStr(
					target.reactComponents,
					DESIGN_MODE_BUDGET.reactComponentsMaxLength,
				) || null,
			reactProps:
				safeMetadataStr(
					target.reactProps,
					DESIGN_MODE_BUDGET.reactPropsMaxLength,
				) || null,
			sourceFile:
				safeMetadataStr(
					target.sourceFile,
					DESIGN_MODE_BUDGET.sourceFileMaxLength,
				) || null,
			textSnippet: clampStr(
				target.textSnippet,
				DESIGN_MODE_BUDGET.textSnippetMaxLength,
			),
			htmlSnippet: clampStr(
				target.htmlSnippet,
				DESIGN_MODE_BUDGET.htmlSnippetMaxLength,
			),
			attributes: safeAttributes(target.attributes),
			accessibility: {
				role: safeMetadataStr(accessibility?.role, 500) || null,
				accessibleName:
					safeMetadataStr(accessibility?.accessibleName, 500) || null,
				ariaLabel: safeMetadataStr(accessibility?.ariaLabel, 500) || null,
			},
			rectViewport: safeRect(target.rectViewport),
			rectPage: safeRect(target.rectPage),
			computedStyles: {
				display: clampStr(computedStyles?.display, 500),
				position: clampStr(computedStyles?.position, 500),
				width: clampStr(computedStyles?.width, 500),
				height: clampStr(computedStyles?.height, 500),
				margin: clampStr(computedStyles?.margin, 500),
				padding: clampStr(computedStyles?.padding, 500),
				color: clampStr(computedStyles?.color, 500),
				backgroundColor: clampStr(computedStyles?.backgroundColor, 500),
				border: clampStr(computedStyles?.border, 500),
				borderRadius: clampStr(computedStyles?.borderRadius, 500),
				fontFamily: clampStr(computedStyles?.fontFamily, 500),
				fontSize: clampStr(computedStyles?.fontSize, 500),
				fontWeight: clampStr(computedStyles?.fontWeight, 500),
				lineHeight: clampStr(computedStyles?.lineHeight, 500),
				textAlign: clampStr(computedStyles?.textAlign, 500),
				zIndex: clampStr(computedStyles?.zIndex, 500),
			},
		},
		nearbyText: clampStrArray(
			obj.nearbyText,
			DESIGN_MODE_BUDGET.nearbyTextMaxEntries,
			DESIGN_MODE_BUDGET.nearbyTextEntryMaxLength,
		),
		ancestorPath: clampStrArray(
			obj.ancestorPath,
			DESIGN_MODE_BUDGET.ancestorPathMaxEntries,
			200,
		),
		screenshot: null,
	};
}
