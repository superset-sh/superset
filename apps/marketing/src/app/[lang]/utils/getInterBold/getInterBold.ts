import { readFile } from "node:fs/promises";
import path from "node:path";

let interBoldPromise: Promise<Buffer> | null = null;

// Lazy, and cleared on failure so a transient read error retries on the next
// request rather than poisoning the warm instance with a rejected promise.
export function getInterBold(): Promise<Buffer> {
	if (!interBoldPromise) {
		interBoldPromise = readFile(
			path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf"),
		);
		interBoldPromise.catch(() => {
			interBoldPromise = null;
		});
	}
	return interBoldPromise;
}
