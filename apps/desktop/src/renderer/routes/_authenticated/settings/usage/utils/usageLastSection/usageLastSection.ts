const STORAGE_KEY = "usage-last-section-v1";

export type UsageSection = "token" | "resources";

/** Fixed-size singleton: which Usage sidebar section was open last. */
export function getUsageLastSection(): UsageSection {
	try {
		return localStorage.getItem(STORAGE_KEY) === "resources"
			? "resources"
			: "token";
	} catch {
		return "token";
	}
}

export function setUsageLastSection(section: UsageSection): void {
	try {
		localStorage.setItem(STORAGE_KEY, section);
	} catch {
		// Storage unavailable/full — remembering the section is best-effort.
	}
}

export function usageSectionPath(
	section: UsageSection,
): "/settings/usage" | "/settings/usage/resources" {
	return section === "resources"
		? "/settings/usage/resources"
		: "/settings/usage";
}
