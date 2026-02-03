import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { type ChangelogEntry, slugify } from "./changelog-utils";

export {
	type ChangelogEntry,
	formatChangelogDate,
	slugify,
} from "./changelog-utils";

const CHANGELOG_DIR = path.join(process.cwd(), "content/changelog");

function parseFrontmatter(filePath: string): ChangelogEntry | null {
	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(fileContent);

		const slug = path.basename(filePath, ".mdx");

		let dateValue: string;
		if (data.date instanceof Date) {
			dateValue = data.date.toISOString().split("T")[0] as string;
		} else if (data.date) {
			dateValue = String(data.date);
		} else {
			dateValue = new Date().toISOString().split("T")[0] as string;
		}

		return {
			slug,
			url: `/changelog/${slug}`,
			title: data.title ?? "Untitled",
			description: data.description,
			date: dateValue,
			image: data.image,
			content,
		};
	} catch {
		return null;
	}
}

export function getChangelogEntries(): ChangelogEntry[] {
	if (!fs.existsSync(CHANGELOG_DIR)) {
		return [];
	}

	const files = fs.readdirSync(CHANGELOG_DIR).filter((f) => f.endsWith(".mdx"));

	const entries = files
		.map((file) => parseFrontmatter(path.join(CHANGELOG_DIR, file)))
		.filter((entry): entry is ChangelogEntry => entry !== null);

	return entries.sort((a, b) => {
		const dateA = new Date(a.date);
		const dateB = new Date(b.date);
		return dateB.getTime() - dateA.getTime();
	});
}

export function getChangelogEntry(slug: string): ChangelogEntry | undefined {
	const filePath = path.join(CHANGELOG_DIR, `${slug}.mdx`);

	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	return parseFrontmatter(filePath) ?? undefined;
}

export function getAllChangelogSlugs(): string[] {
	if (!fs.existsSync(CHANGELOG_DIR)) {
		return [];
	}

	return fs
		.readdirSync(CHANGELOG_DIR)
		.filter((f) => f.endsWith(".mdx"))
		.map((f) => f.replace(".mdx", ""));
}

export function extractToc(
	content: string,
): { id: string; text: string; level: number }[] {
	const headingRegex = /^(#{2,3})\s+(.+)$/gm;
	const toc: { id: string; text: string; level: number }[] = [];

	for (const match of content.matchAll(headingRegex)) {
		const hashes = match[1];
		const heading = match[2];
		if (!hashes || !heading) continue;

		const level = hashes.length;
		const text = heading.trim();
		const id = slugify(text);

		toc.push({ id, text, level });
	}

	return toc;
}
