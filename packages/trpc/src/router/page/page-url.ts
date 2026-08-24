import { env } from "../../env";

export function pageUrl(slug: string): string {
	return `${env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "")}/page/${slug}`;
}
