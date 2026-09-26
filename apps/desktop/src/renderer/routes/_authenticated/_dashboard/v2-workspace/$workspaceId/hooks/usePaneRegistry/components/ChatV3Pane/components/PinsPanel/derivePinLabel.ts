const MAX_LABEL_LENGTH = 60;

export function derivePinLabel(text: string): string {
	const firstLine =
		text
			.split("\n")
			.map((line) =>
				line
					.replace(/^(#{1,6}\s*|>\s*|[-*]\s*|\d+[.)]\s*)/, "")
					.replace(/^\[[ xX]\]\s*/, "")
					.trim(),
			)
			.find((line) => line.length > 0) ?? "";
	if (firstLine.length <= MAX_LABEL_LENGTH) return firstLine;
	return `${firstLine.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
}
