/**
 * Pure utility functions and types for the blog system.
 * These can be safely imported in both server and client components.
 */

import type { BlogCategory } from "./blog-constants";
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
	content: string;
}

export function formatBlogDate(date: string): string {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}
