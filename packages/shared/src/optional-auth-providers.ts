export function optionalAuthProviders(value?: string): "gitlab"[] {
	const requested = new Set(
		value?.split(",").map((provider) => provider.trim()),
	);
	return (["gitlab"] as const).filter((provider) => requested.has(provider));
}

export function mobileAuthProviders(value?: string) {
	const requested = new Set(
		(value?.trim() || "apple,github,google")
			.split(",")
			.map((provider) => provider.trim().toLowerCase()),
	);
	return (["apple", "github", "google", "gitlab"] as const).filter((provider) =>
		requested.has(provider),
	);
}
