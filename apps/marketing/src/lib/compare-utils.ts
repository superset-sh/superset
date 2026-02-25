/**
 * Pure utility functions and types for the comparison page system.
 * These can be safely imported in both server and client components.
 */

import { formatContentDate } from "./content-utils";

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
	faq?: Array<{ question: string; answer: string }>;
	content: string;
}

export function formatCompareDate(date: string): string {
	return formatContentDate(date, "short");
}
