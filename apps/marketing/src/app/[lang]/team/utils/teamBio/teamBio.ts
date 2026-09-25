export type TeamBioSegment =
	| {
			type: "text";
			text: string;
	  }
	| {
			type: "link";
			text: string;
			href: string;
	  };

const safeAnchorPattern =
	/<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi;
const htmlTagPattern = /<[^>]*>/g;

function toText(value: string): string {
	return value.replace(htmlTagPattern, "");
}

export function parseTeamBio(bio: string): TeamBioSegment[] {
	const segments: TeamBioSegment[] = [];
	let lastIndex = 0;

	for (const match of bio.matchAll(safeAnchorPattern)) {
		const fullMatch = match[0];
		const href = match[1] ?? "";
		const linkText = match[2] ?? "";
		const index = match.index ?? 0;

		if (index > lastIndex) {
			segments.push({
				type: "text",
				text: toText(bio.slice(lastIndex, index)),
			});
		}

		segments.push({ type: "link", text: toText(linkText), href });

		lastIndex = index + fullMatch.length;
	}

	if (lastIndex < bio.length) {
		segments.push({
			type: "text",
			text: toText(bio.slice(lastIndex)),
		});
	}

	return segments;
}

export function getTeamBioText(bio: string): string {
	return parseTeamBio(bio)
		.map((segment) => segment.text)
		.join("");
}
