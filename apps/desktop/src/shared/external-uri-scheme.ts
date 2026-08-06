/**
 * Scheme policy for URIs the user activates from untrusted app content —
 * today that means terminal OSC 8 hyperlinks and detected URLs.
 *
 * Terminal output is attacker-influenced (build logs, `cat` of a checked-in
 * file, a hostile statusline), and the link text is arbitrary: "open in
 * cursor" can point anywhere. So schemes fall into three tiers:
 *
 * - `allow`  — web/mail URLs, dispatched without further ceremony.
 * - `confirm` — custom app schemes (`cursor:`, `vscode:`, `slack:`, …). These
 *   hand off to whatever the OS has registered, so the user gets to see the
 *   real URI and approve it before we dispatch.
 * - `block`  — schemes that execute script or launch a local file/binary with
 *   no OS-level handoff of its own.
 */

const WEB_SCHEMES = new Set(["http:", "https:"]);

const ALWAYS_ALLOWED_SCHEMES = new Set([...WEB_SCHEMES, "mailto:"]);

const BLOCKED_SCHEMES = new Set([
	"javascript:",
	"vbscript:",
	"data:",
	"blob:",
	"file:",
	"about:",
	"view-source:",
	"chrome:",
	"devtools:",
]);

export type ExternalUriDecision = "allow" | "confirm" | "block";

function protocolOf(uri: string): string | null {
	if (typeof uri !== "string" || uri.length === 0) return null;
	try {
		return new URL(uri).protocol.toLowerCase();
	} catch {
		return null;
	}
}

/**
 * Decide how a user-activated URI should be dispatched. Anything that isn't a
 * parseable absolute URI is blocked.
 */
export function classifyExternalUri(uri: string): ExternalUriDecision {
	const protocol = protocolOf(uri);
	if (!protocol) return "block";
	if (ALWAYS_ALLOWED_SCHEMES.has(protocol)) return "allow";
	if (BLOCKED_SCHEMES.has(protocol)) return "block";
	return "confirm";
}

/**
 * Scheme-only label for logging. URIs can carry tokens and local paths in the
 * rest of the string, so never log the URI itself.
 */
export function externalUriSchemeLabel(uri: string): string {
	if (typeof uri !== "string" || uri.length === 0) return "empty";
	try {
		return new URL(uri).protocol || "unknown:";
	} catch {
		return "malformed";
	}
}

/** True for URIs an in-app browser pane can render (http/https only). */
export function isWebUri(uri: string): boolean {
	const protocol = protocolOf(uri);
	return protocol !== null && WEB_SCHEMES.has(protocol);
}
