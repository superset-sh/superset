import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const LEGAL_DIR = path.join(process.cwd(), "content/legal");

export interface LegalPage {
	slug: string;
	title: string;
	description: string;
	lastUpdated: string;
	content: string;
}

export function getLegalPage(slug: string): LegalPage | null {
	const filePath = path.join(LEGAL_DIR, `${slug}.mdx`);

	if (!fs.existsSync(filePath)) {
		return null;
	}

	const fileContent = fs.readFileSync(filePath, "utf-8");
	const { data, content } = matter(fileContent);

	return {
		slug,
		title: data.title ?? "Untitled",
		description: data.description ?? "",
		lastUpdated: data.lastUpdated ?? "",
		content,
	};
}

export function getAllLegalSlugs(): string[] {
	if (!fs.existsSync(LEGAL_DIR)) {
		return [];
	}

	return fs
		.readdirSync(LEGAL_DIR)
		.filter((f) => f.endsWith(".mdx"))
		.map((f) => path.basename(f, ".mdx"));
}
