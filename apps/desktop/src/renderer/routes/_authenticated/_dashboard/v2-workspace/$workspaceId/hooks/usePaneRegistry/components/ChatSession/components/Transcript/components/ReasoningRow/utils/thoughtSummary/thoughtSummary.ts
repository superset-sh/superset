export function thoughtSummary(text: string): string {
	const paragraph = text
		.replace(/```[\s\S]*?(```|$)/g, "\n\n")
		.split(/\n\s*\n/)
		.map((part) => part.trim())
		.find((part) => part.length > 0);
	if (!paragraph) return "";
	return paragraph
		.replace(/`([^`]*)`/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^[#>\-*+\s]+/gm, "")
		.replace(/[*_~]+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
