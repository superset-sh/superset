import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const peopleDirectory = path.join(process.cwd(), "content/people");

export const personSchema = z.object({
	name: z.string().min(1, "Name is required"),
	role: z.string().min(1, "Role is required"),
	bio: z.string().optional(),
	twitter: z.string().optional(),
	github: z.string().optional(),
	linkedin: z.string().optional(),
	avatar: z.string().optional(),
	order: z.number().optional(),
});

export type PersonMetadata = z.infer<typeof personSchema>;

export interface Person extends PersonMetadata {
	id: string;
	content: string;
}

export function getPersonById(id: string): Person | null {
	const filePath = path.join(peopleDirectory, `${id}.mdx`);

	if (!fs.existsSync(filePath)) {
		return null;
	}

	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(fileContent);
		const validatedData = personSchema.parse(data);

		return {
			...validatedData,
			id,
			content,
		};
	} catch (error) {
		console.error(`[people] Failed to parse ${id}.mdx:`, error);
		return null;
	}
}

export function getAllPeople(): Person[] {
	if (!fs.existsSync(peopleDirectory)) {
		return [];
	}

	const fileNames = fs.readdirSync(peopleDirectory);
	const mdxFiles = fileNames.filter((fileName) => fileName.endsWith(".mdx"));
	const people: Person[] = [];

	for (const fileName of mdxFiles) {
		const id = fileName.replace(/\.mdx$/, "");
		const person = getPersonById(id);
		if (person) {
			people.push(person);
		}
	}

	return people.sort(
		(a, b) =>
			(a.order ?? Number.MAX_SAFE_INTEGER) -
			(b.order ?? Number.MAX_SAFE_INTEGER),
	);
}
