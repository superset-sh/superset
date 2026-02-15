const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

export const URL_PATTERN_SOURCE = String.raw`\bhttps?:\/\/[^\s<>[\]'"]+`;

export function trimUnbalancedParens(url: string): string {
	let openCount = 0;
	let endIndex = url.length;

	for (let i = 0; i < url.length; i++) {
		if (url[i] === "(") {
			openCount++;
		} else if (url[i] === ")") {
			if (openCount > 0) {
				openCount--;
			} else {
				endIndex = i;
				break;
			}
		}
	}

	let result = url.slice(0, endIndex);

	while (result.endsWith("(")) {
		result = result.slice(0, -1);
	}

	return result;
}

export function cleanUrlMatch(raw: string): string {
	let text = trimUnbalancedParens(raw);
	text = text.replace(TRAILING_PUNCTUATION, "");
	return text;
}
