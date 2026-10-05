import type {
	LinkAction,
	ModifierEvent,
	UrlLinkAction,
} from "renderer/lib/clickPolicy";

export interface LinkClickEvent extends ModifierEvent {
	button: number;
	target: EventTarget | null;
}

export type ResolvedLinkClick =
	| { kind: "none" }
	| { kind: "unbound" }
	| { kind: "open"; url: string; action: LinkAction };

const WEB_URL = /^https?:\/\//i;

export function resolveLinkClick(
	event: LinkClickEvent,
	getAction: UrlLinkAction,
): ResolvedLinkClick {
	if (event.button !== 0) return { kind: "none" };
	const target = event.target as HTMLElement | null;
	const href = target?.closest?.("a")?.getAttribute("href");
	if (!href || !WEB_URL.test(href)) return { kind: "none" };
	const action = getAction(event, href);
	if (action === null) return { kind: "unbound" };
	return { kind: "open", url: href, action };
}
