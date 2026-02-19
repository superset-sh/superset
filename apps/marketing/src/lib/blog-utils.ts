/**
 * Pure utility functions and types for the blog system.
 * These can be safely imported in both server and client components.
 */

import type { BlogCategory } from "./blog-constants";
import { formatContentDate } from "./content-utils";
import type { Person } from "./people";

export interface TocItem {
	id: string;
	text: string;
	level: number;
}

export interface BlogPost {
	slug: string;
	url: string;
	title: string;
	description?: string;
	author: Person;
	date: string;
	category: BlogCategory;
	image?: string;
	relatedSlugs?: string[];
	faq?: Array<{ question: string; answer: string }>;
	keywords?: string[];
	content: string;
}

export { slugify } from "./content-utils";

export function formatBlogDate(date: string): string {
	return formatContentDate(date, "short");
}
