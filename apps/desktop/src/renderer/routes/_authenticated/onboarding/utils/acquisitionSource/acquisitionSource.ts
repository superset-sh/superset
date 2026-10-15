export const ACQUISITION_SOURCES = [
	"search_engine",
	"ai_assistant",
	"x_twitter",
	"youtube",
	"reddit",
	"hacker_news",
	"product_hunt",
	"github",
	"friend_or_colleague",
	"newsletter_blog_podcast",
	"other",
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const ACQUISITION_SOURCE_OTHER_MAX_LENGTH = 100;

export const ACQUISITION_SOURCE_EVENT = "acquisition_source_answered";

export function isAcquisitionSource(value: string): value is AcquisitionSource {
	return (ACQUISITION_SOURCES as readonly string[]).includes(value);
}

export function buildAcquisitionSourceProperties(
	source: AcquisitionSource | null,
	otherText: string,
): Record<string, unknown> | null {
	if (!source) return null;
	const text =
		source === "other"
			? otherText.trim().slice(0, ACQUISITION_SOURCE_OTHER_MAX_LENGTH)
			: "";
	if (!text) {
		return {
			source,
			$set: { acquisition_source: source },
			$unset: ["acquisition_source_other"],
		};
	}
	return {
		source,
		other_text: text,
		$set: { acquisition_source: source, acquisition_source_other: text },
	};
}
