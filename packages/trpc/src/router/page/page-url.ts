import { env } from "../../env";

// Derived from the web app's URL so the two cannot drift. The one place to
// change if pages ever get a user-content domain.
export function pageUrl(slug: string): string {
	return `${env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "")}/p/${slug}`;
}
