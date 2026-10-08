interface ImportSource {
	browserName: string;
	profileName: string;
}

/**
 * Sources whose browser matches `from`. A browser named exactly `from`, or
 * ending in it as a whole word ("Chrome" for "Google Chrome"), wins over a
 * partial match, so "Opera" doesn't also pick "Opera GX". The browser is
 * chosen before `profile` narrows it, so a profile name never switches browsers.
 */
export function matchSources<T extends ImportSource>(
	sources: T[],
	from: string,
	profile?: string,
): T[] {
	const wantedBrowser = from.toLowerCase();
	const wantedProfile = profile?.toLowerCase();
	const exact = sources.filter((s) => {
		const name = s.browserName.toLowerCase();
		return name === wantedBrowser || name.endsWith(` ${wantedBrowser}`);
	});
	const browserMatches =
		exact.length > 0
			? exact
			: sources.filter((s) =>
					s.browserName.toLowerCase().includes(wantedBrowser),
				);
	if (!wantedProfile) return browserMatches;
	return browserMatches.filter((s) =>
		s.profileName.toLowerCase().includes(wantedProfile),
	);
}
