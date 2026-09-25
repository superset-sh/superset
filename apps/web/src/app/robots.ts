import type { MetadataRoute } from "next";

/**
 * Nothing here is meant to be indexed — every route is either behind sign-in
 * or carries noindex — but link previews (Slack, Facebook, LinkedIn) fetch
 * robots.txt before they fetch a page, and a redirect to sign-in reads as a
 * block. Allow the fetch; the meta tags say not to index.
 */
export default function robots(): MetadataRoute.Robots {
	return { rules: { userAgent: "*", allow: "/" } };
}
