import type { StaticUrl } from "shared/types";

export interface InterpolationVariables {
	WORKSPACE?: string;
	PORT?: string;
}

/**
 * Interpolate variables in a URL string.
 * Replaces `${VARIABLE_NAME}` patterns with their values from the variables map.
 * Unresolvable variables are left as-is (e.g. `${UNKNOWN}` stays as `${UNKNOWN}`).
 *
 * @param url - The URL string potentially containing `${VAR}` placeholders
 * @param variables - Map of variable names to their values
 * @returns The URL with known variables replaced
 */
export function interpolateUrl(
	url: string,
	variables: InterpolationVariables,
): string {
	return url.replace(/\$\{(\w+)\}/g, (match, name: string) => {
		const value = variables[name as keyof InterpolationVariables];
		return value !== undefined ? value : match;
	});
}

/**
 * Interpolate variables in all URLs in a static URL configuration.
 *
 * @param urls - Array of static URL entries
 * @param variables - Map of variable names to their values
 * @returns New array with interpolated URLs (labels are unchanged)
 */
export function interpolateStaticUrls(
	urls: StaticUrl[],
	variables: InterpolationVariables,
): StaticUrl[] {
	return urls.map((entry) => ({
		url: interpolateUrl(entry.url, variables),
		label: entry.label,
	}));
}
