/**
 * Pure utility functions and types for the changelog system.
 * These can be safely imported in both server and client components.
 */

export interface ChangelogEntry {
	slug: string;
	url: string;
	title: string;
	description?: string;
	date: string;
	image?: string;
	content: string;
}

export function formatChangelogDate(date: string): string {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}
