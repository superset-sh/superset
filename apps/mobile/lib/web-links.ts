import { env } from "@/lib/env";

/**
 * Shareable web-app link for a workspace. `/workspaces/<id>` is the chosen
 * canonical share path — the web app doesn't serve it yet (planned: restore
 * the route or deep-link into desktop; tracked as SUPER-1846).
 */
export function workspaceShareUrl(workspaceId: string): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/workspaces/${workspaceId}`;
}

/**
 * Where a plan is actually changed. The mobile app never sells a plan — the
 * organization's owner does it on the web — so the settings row links here.
 */
export function billingSettingsUrl(): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/settings/billing`;
}
