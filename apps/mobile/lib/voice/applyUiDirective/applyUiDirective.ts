import type { VoiceUiDirective } from "@superset/shared/voice";

export interface DirectiveRouter {
	push(href: string): void;
	dismissTo(href: string): void;
	dismiss(): void;
	setParams(params: Record<string, string>): void;
}

const BASE_PATHS = [/^\/$/, /^\/workspace\/[^/]+$/, /^\/pages\/[^/]+$/];

function isBase(pathname: string): boolean {
	return BASE_PATHS.some((pattern) => pattern.test(pathname));
}

export function directiveHref(
	directive: VoiceUiDirective,
): { href: string; base: boolean } | null {
	const target = directive.navigate;
	if (!target) return null;
	switch (target.screen) {
		case "home":
			return { href: "/(authenticated)/(home)", base: true };
		case "workspace":
			return {
				href: `/(authenticated)/workspace/${target.workspaceId}${
					target.terminalId
						? `?tab=${encodeURIComponent(target.terminalId)}`
						: ""
				}`,
				base: true,
			};
		case "sessions":
			return {
				href: `/(authenticated)/workspace/${target.workspaceId}/sessions`,
				base: false,
			};
		case "pull_requests":
			return {
				href: `/(authenticated)/workspace/${target.workspaceId}/pull-requests`,
				base: false,
			};
		case "page":
			return {
				href: `/(authenticated)/pages/${encodeURIComponent(target.slug)}`,
				base: true,
			};
	}
}

/** Where `href` lands as a pathname, for comparing against where we already are. */
function pathnameOf(href: string): string {
	const path = href.replace(/\?.*$/, "").replace(/\([^)]*\)\//g, "");
	return path === "/(home)" || path === "" ? "/" : path;
}

/**
 * Navigates the Stack beneath the voice layer. Already there means no push;
 * a sheet on top is dismissed first so the next screen is not presented as
 * a sliver inside it; home is reached by unwinding, not by pushing a copy.
 */
export function applyUiDirective(
	directive: VoiceUiDirective,
	{ router, pathname }: { router: DirectiveRouter; pathname: string },
): boolean {
	const target = directiveHref(directive);
	if (!target) return false;
	const destination = pathnameOf(target.href);
	if (destination === pathname) {
		const terminalId =
			directive.navigate?.screen === "workspace"
				? directive.navigate.terminalId
				: undefined;
		if (!terminalId) return false;
		router.setParams({ tab: terminalId });
		return true;
	}
	if (target.base && !isBase(pathname)) router.dismiss();
	if (destination === "/") {
		router.dismissTo(target.href);
		return true;
	}
	if (
		!target.base &&
		pathname.startsWith(`${destination.replace(/\/[^/]+$/, "")}`)
	) {
		router.push(target.href);
		return true;
	}
	router.push(target.href);
	return true;
}
