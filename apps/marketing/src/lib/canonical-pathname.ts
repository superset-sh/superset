import { SUPPORTED_LOCALES } from "@superset/i18n/locales";

// Percent-encoded bytes keep their hex case, so a non-ASCII slug never redirects to itself.
function lowercaseSegment(segment: string): string {
	return segment.replace(/%[0-9A-Fa-f]{2}|[A-Z]+/g, (match) =>
		match.startsWith("%") ? match : match.toLowerCase(),
	);
}

export function canonicalPathname(pathname: string): string {
	const segments = pathname.split("/");
	const first = segments[1]?.toLowerCase();
	const locale = SUPPORTED_LOCALES.find(
		(candidate) => candidate.toLowerCase() === first,
	);
	return segments
		.map((segment, index) =>
			index === 1 && locale ? locale : lowercaseSegment(segment),
		)
		.join("/");
}
