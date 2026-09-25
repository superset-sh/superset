// Browser Design Mode — shared types for the element-picker flow.
//
// These types define the contract between main, the injected guest script,
// and the renderer. The payload is extracted in the (untrusted) guest page,
// re-validated in main (see main/lib/browser/design-mode-payload.ts), and only
// then shown in renderer chrome.

/** Page-level metadata captured at selection time. */
export interface DesignModePageContext {
	sanitizedUrl: string;
	title: string;
	viewportWidth: number;
	viewportHeight: number;
	scrollX: number;
	scrollY: number;
	devicePixelRatio: number;
}

/** Accessibility metadata for the selected element. */
export interface DesignModeAccessibility {
	role: string | null;
	accessibleName: string | null;
	ariaLabel: string | null;
}

/** Curated subset of computed styles. */
export interface DesignModeComputedStyles {
	display: string;
	position: string;
	width: string;
	height: string;
	margin: string;
	padding: string;
	color: string;
	backgroundColor: string;
	border: string;
	borderRadius: string;
	fontFamily: string;
	fontSize: string;
	fontWeight: string;
	lineHeight: string;
	textAlign: string;
	zIndex: string;
}

/** Viewport-relative or page-relative rectangle in CSS pixels. */
export interface DesignModeRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The selected element's extracted data. */
export interface DesignModeTarget {
	tagName: string;
	selector: string;
	/** Short human-readable ancestor chain (ids/aria/roles/stable classes). */
	elementPath: string;
	cssClasses: string;
	/** React component chain from the element's fiber, when detectable. */
	reactComponents: string | null;
	/** Shallow prop summary of the innermost named component, when detectable. */
	reactProps: string | null;
	/** `file:line[:col]` from React dev builds' _debugSource, when present. */
	sourceFile: string | null;
	textSnippet: string;
	htmlSnippet: string;
	attributes: Record<string, string>;
	accessibility: DesignModeAccessibility;
	rectViewport: DesignModeRect;
	rectPage: DesignModeRect;
	computedStyles: DesignModeComputedStyles;
}

/** Screenshot of the selected element — always a PNG data URL. */
export interface DesignModeScreenshot {
	mimeType: "image/png";
	dataUrl: string;
	width: number;
	height: number;
}

/** The full payload extracted from a design-mode selection. */
export interface DesignModePayload {
	page: DesignModePageContext;
	target: DesignModeTarget;
	nearbyText: string[];
	ancestorPath: string[];
	screenshot: DesignModeScreenshot | null;
}

/** Why a design-mode operation ended without a selection. */
export type DesignModeCancelReason =
	| "user"
	| "navigation"
	| "destroyed"
	| "timeout";

/** Result of a single await-selection operation. */
export type DesignModeSelectionResult =
	| { opId: string; kind: "selected"; payload: DesignModePayload }
	| { opId: string; kind: "cancelled"; reason: DesignModeCancelReason }
	| { opId: string; kind: "error"; reason: string };

// ---------------------------------------------------------------------------
// Payload budgets — enforced in both the guest script and main
// ---------------------------------------------------------------------------

export const DESIGN_MODE_BUDGET = {
	textSnippetMaxLength: 200,
	nearbyTextEntryMaxLength: 200,
	nearbyTextMaxEntries: 10,
	htmlSnippetMaxLength: 4096,
	ancestorPathMaxEntries: 10,
	selectorMaxLength: 700,
	pathMaxLength: 900,
	cssClassesMaxLength: 500,
	sourceFileMaxLength: 500,
	reactComponentsMaxLength: 500,
	reactPropsMaxLength: 500,
	/** Hard byte budget for the screenshot PNG before it is omitted. */
	screenshotMaxBytes: 2 * 1024 * 1024,
} as const;

// ---------------------------------------------------------------------------
// Attribute allowlist + secret redaction (mirrored guest-side)
// ---------------------------------------------------------------------------

/** Only these attribute names survive into the payload (plus aria-*). */
export const DESIGN_MODE_SAFE_ATTRIBUTE_NAMES = new Set([
	"id",
	"class",
	"name",
	"type",
	"role",
	"href",
	"src",
	"alt",
	"title",
	"placeholder",
	"for",
	"action",
	"method",
]);

/**
 * Substrings in attribute values or metadata that indicate secrets — matching
 * values are redacted. Deliberately tighter than broad words like "code" or
 * "state", which match ordinary CSS class names; the intent is OAuth callback
 * params and credential-like values.
 */
export const DESIGN_MODE_SECRET_PATTERNS = [
	"access_token",
	"auth_token",
	"api_key",
	"apikey",
	"client_secret",
	"oauth_state",
	"x-amz-",
	"session_id",
	"sessionid",
	"csrf",
	"secret",
	"password",
	"passwd",
];

/** Computed style properties to extract — matches DesignModeComputedStyles. */
export const DESIGN_MODE_STYLE_PROPERTIES: readonly (keyof DesignModeComputedStyles)[] =
	[
		"display",
		"position",
		"width",
		"height",
		"margin",
		"padding",
		"color",
		"backgroundColor",
		"border",
		"borderRadius",
		"fontFamily",
		"fontSize",
		"fontWeight",
		"lineHeight",
		"textAlign",
		"zIndex",
	];
