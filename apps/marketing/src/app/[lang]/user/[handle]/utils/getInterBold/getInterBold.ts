import { readFile } from "node:fs/promises";
import path from "node:path";

let interBoldPromise: Promise<Buffer> | null = null;

export function getInterBold(): Promise<Buffer> {
	if (!interBoldPromise) {
		interBoldPromise = readFile(
			path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf"),
		);
	}
	return interBoldPromise;
}
