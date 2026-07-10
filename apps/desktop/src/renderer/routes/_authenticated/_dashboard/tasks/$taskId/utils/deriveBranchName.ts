import { sanitizeSegment } from "@superset/shared/workspace-launch";

export function deriveBranchName({
	slug,
	title,
}: {
	slug: string;
	title: string;
}): string {
	const prefix = slug.toLowerCase();
	const titleSegment = sanitizeSegment(title, 40);
	return titleSegment ? `${prefix}-${titleSegment}` : prefix;
}
