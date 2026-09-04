import { formatDate } from "@superset/i18n/format";

// Release dates are rendered on both sides of the server/client boundary, so
// the zone has to be pinned. Vercel runs UTC while the visitor's browser does
// not: a release published at 05:13Z is "Aug 31" on the server and "Aug 30" in
// US-Pacific, which React reports as a hydration mismatch. Same reason the
// production-run page pins UTC.
export function formatReleaseDate(publishedAt: string): string {
	return formatDate(new Date(publishedAt), {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}
