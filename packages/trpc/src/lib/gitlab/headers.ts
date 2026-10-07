export function gitlabHeaders(
	input?:
		| Iterable<Iterable<string>>
		| Record<string, string | undefined | readonly string[]>,
): Headers {
	const headers = new Headers();
	if (!input) return headers;
	if (Symbol.iterator in input) {
		for (const entry of input) {
			const pair = typeof entry === "string" ? [] : Array.from(entry);
			if (
				pair.length !== 2 ||
				typeof pair[0] !== "string" ||
				typeof pair[1] !== "string"
			)
				throw new TypeError("Invalid GitLab header pair");
			headers.append(pair[0], pair[1]);
		}
	} else {
		for (const [name, value] of Object.entries(input)) {
			if (value === undefined) continue;
			if (typeof value === "string") headers.set(name, value);
			else
				for (const item of value) {
					if (typeof item !== "string")
						throw new TypeError("Invalid GitLab header value");
					headers.append(name, item);
				}
		}
	}
	return headers;
}
