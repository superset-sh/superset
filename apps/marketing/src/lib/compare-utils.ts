/**
 * Pure utility functions and types for the comparison page system.
 * These can be safely imported in both server and client components.
 */

export interface ComparisonPage {
	slug: string;
	url: string;
	title: string;
	description: string;
	date: string;
	lastUpdated?: string;
	type: "1v1" | "roundup" | "tutorial";
	competitors: string[];
	keywords: string[];
	image?: string;
	content: string;
}

export function formatCompareDate(date: string): string {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}
