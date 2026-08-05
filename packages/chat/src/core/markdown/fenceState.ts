export type FenceState = {
	open: boolean;
	lang: string | null;
};

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export function fenceState(markdown: string): FenceState {
	let open: { char: string; length: number; lang: string | null } | null = null;

	for (const line of markdown.split("\n")) {
		const match = FENCE_PATTERN.exec(line);
		if (!match) continue;
		const marker = match[1] as string;
		const info = (match[2] as string).trim();

		if (!open) {
			if (marker.startsWith("`") && info.includes("`")) continue;
			open = {
				char: marker[0] as string,
				length: marker.length,
				lang: info === "" ? null : info,
			};
			continue;
		}

		if (
			marker[0] === open.char &&
			marker.length >= open.length &&
			info === ""
		) {
			open = null;
		}
	}

	return open ? { open: true, lang: open.lang } : { open: false, lang: null };
}
