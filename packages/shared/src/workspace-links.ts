import { PROTOCOL_SCHEMES } from "./constants";

/**
 * The one place a link to a workspace is built.
 *
 * A workspace is addressed two ways: the native `superset://` deep link the
 * desktop app registers, and the public HTTPS handoff page that opens it from
 * somewhere that only accepts HTTP(S) links (Linear, GitHub, email). Both are
 * built here so an integration never reconstructs a Superset route by hand and
 * the two can never drift apart.
 */

/** Path segment shared by the native deep link and the public handoff route. */
export const WORKSPACE_LINK_SEGMENT = "v2-workspace";

/** Public, authentication-free handoff route served by the web app. */
export const PUBLIC_WORKSPACE_HANDOFF_PATH = `/open/${WORKSPACE_LINK_SEGMENT}`;

/**
 * Query params a handoff link may carry into the desktop app, in the order
 * they are emitted. These are the deep-link params the CLI reference
 * documents; everything else is dropped, so a public link can never smuggle
 * arbitrary state (a redirect, an `openUrl`) into the app.
 */
export const WORKSPACE_HANDOFF_PARAMS = [
	"chatSessionId",
	"terminalId",
	"focusRequestId",
] as const;

export type WorkspaceHandoffParam = (typeof WORKSPACE_HANDOFF_PARAMS)[number];

export type WorkspaceHandoffParams = Partial<
	Record<WorkspaceHandoffParam, string>
>;

const WORKSPACE_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspace ids are uuids. Anything else is a malformed link, not a lookup. */
export function isWorkspaceId(value: unknown): value is string {
	return typeof value === "string" && WORKSPACE_ID.test(value);
}

function assertWorkspaceId(value: string): void {
	if (!isWorkspaceId(value)) {
		throw new TypeError(`Not a workspace id: ${value}`);
	}
}

/**
 * Narrows an arbitrary query bag (Next.js `searchParams`, `URLSearchParams`)
 * to the allowlist. Repeated params keep their first value, matching
 * `URLSearchParams.get`.
 */
export function pickWorkspaceHandoffParams(
	source: URLSearchParams | Record<string, string | string[] | undefined>,
): WorkspaceHandoffParams {
	const read = (name: WorkspaceHandoffParam): string | undefined => {
		if (source instanceof URLSearchParams) return source.get(name) ?? undefined;
		const value = source[name];
		return Array.isArray(value) ? value[0] : value;
	};

	const picked: WorkspaceHandoffParams = {};
	for (const name of WORKSPACE_HANDOFF_PARAMS) {
		const value = read(name);
		if (value) picked[name] = value;
	}
	return picked;
}

function handoffQuery(params: WorkspaceHandoffParams): string {
	const search = new URLSearchParams();
	for (const name of WORKSPACE_HANDOFF_PARAMS) {
		const value = params[name];
		if (value) search.set(name, value);
	}
	const query = search.toString();
	return query ? `?${query}` : "";
}

/**
 * The native link that opens a workspace in the installed desktop app.
 * Throws on a malformed id rather than emitting a link that resolves to
 * nothing.
 */
export function buildWorkspaceDeepLink(
	workspaceId: string,
	params: WorkspaceHandoffParams = {},
): string {
	assertWorkspaceId(workspaceId);
	return `${PROTOCOL_SCHEMES.PROD}://${WORKSPACE_LINK_SEGMENT}/${workspaceId}${handoffQuery(params)}`;
}

/**
 * The public HTTPS link that hands a workspace off to the desktop app.
 * `webUrl` is the web app's origin (`SUPERSET_WEB_URL`).
 */
export function buildPublicWorkspaceHandoffUrl(
	workspaceId: string,
	webUrl: string,
	params: WorkspaceHandoffParams = {},
): string {
	assertWorkspaceId(workspaceId);
	const url = new URL(
		`${PUBLIC_WORKSPACE_HANDOFF_PATH}/${workspaceId}`,
		webUrl,
	);
	url.search = handoffQuery(params);
	return url.toString();
}
