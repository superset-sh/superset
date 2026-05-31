export type DashboardMode = "chat" | "code" | "work";

const WORKSPACE_ROUTE_RE = /^\/v2-workspace\/([^/]+)(?:\/|$)/;
const WORKSPACE_CHAT_ROUTE_RE = /^\/v2-workspace\/[^/]+\/chat\/?$/;
const WORKSPACE_WORK_ROUTE_RE = /^\/v2-workspace\/[^/]+\/work\/?$/;

function normalizePathname(pathname: string): string {
	if (pathname.length <= 1) return pathname;
	return pathname.replace(/\/+$/, "");
}

export function getDashboardModeForPath(pathname: string): DashboardMode {
	const normalized = normalizePathname(pathname);
	if (normalized === "/chat" || WORKSPACE_CHAT_ROUTE_RE.test(normalized)) {
		return "chat";
	}
	if (normalized === "/work" || WORKSPACE_WORK_ROUTE_RE.test(normalized)) {
		return "work";
	}
	return "code";
}

export function getV2WorkspaceIdFromPath(pathname: string): string | null {
	const match = normalizePathname(pathname).match(WORKSPACE_ROUTE_RE);
	return match?.[1] ?? null;
}
