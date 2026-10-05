interface ImportSource {
	browserName: string;
	profileName: string;
}

/**
 * Sources whose browser matches `from`. A browser named exactly `from`, or
 * ending in it as a whole word ("Chrome" for "Google Chrome"), wins over a
 * partial match, so "Opera" doesn't also pick "Opera GX".
 */
export function matchSources<T extends ImportSource>(
	sources: T[],
	from: string,
	profile?: string,
): T[] {
	const wantedBrowser = from.toLowerCase();
	const wantedProfile = profile?.toLowerCase();
	const candidates = sources.filter(
		(s) =>
			!wantedProfile || s.profileName.toLowerCase().includes(wantedProfile),
	);
	const exact = candidates.filter((s) => {
		const name = s.browserName.toLowerCase();
		return name === wantedBrowser || name.endsWith(` ${wantedBrowser}`);
	});
	if (exact.length > 0) return exact;
	return candidates.filter((s) =>
		s.browserName.toLowerCase().includes(wantedBrowser),
	);
}
