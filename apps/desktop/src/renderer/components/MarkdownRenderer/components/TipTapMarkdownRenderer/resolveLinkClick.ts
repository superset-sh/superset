import type {
	ClickPolicy,
	LinkAction,
	ModifierEvent,
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
	getAction: ClickPolicy["getAction"],
): ResolvedLinkClick {
	if (event.button !== 0) return { kind: "none" };
	const target = event.target as HTMLElement | null;
	const href = target?.closest?.("a")?.getAttribute("href");
	if (!href || !WEB_URL.test(href)) return { kind: "none" };
	const action = getAction(event);
	if (action === null) return { kind: "unbound" };
	return { kind: "open", url: href, action };
}
