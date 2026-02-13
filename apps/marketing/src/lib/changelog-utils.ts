/**
 * Pure utility functions and types for the changelog system.
 * These can be safely imported in both server and client components.
 */

import { formatContentDate } from "./content-utils";

export interface ChangelogEntry {
	slug: string;
	url: string;
	title: string;
	description?: string;
	date: string;
	image?: string;
	content: string;
}

export { slugify } from "./content-utils";

export function formatChangelogDate(date: string): string {
	return formatContentDate(date, "long");
}
