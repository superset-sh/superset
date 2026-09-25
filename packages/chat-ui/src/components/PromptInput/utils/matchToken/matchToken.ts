import type { MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";

export function matchToken(
	text: string,
	trigger: string,
): MenuTextMatch | null {
	const pattern = new RegExp(`(^|\\s)(\\${trigger}([\\w./:-]*))$`);
	const match = pattern.exec(text);
	if (!match) return null;
	const leadOffset = match.index + (match[1]?.length ?? 0);
	return {
		leadOffset,
		matchingString: match[3] ?? "",
		replaceableString: match[2] ?? "",
	};
}
