// Sorts the `#:` reference comments within each catalog entry. Lingui emits
// them in filesystem-traversal order, which differs between macOS and Linux,
// so an extract on one platform dirties a catalog committed from the other
// and the CI drift check fails. Runs after every extract (see package.json).
import { readdirSync } from "node:fs";
import { join } from "node:path";

const localesDir = join(import.meta.dir, "..", "locales");

for (const locale of readdirSync(localesDir)) {
	const path = join(localesDir, locale, "messages.po");
	const file = Bun.file(path);
	if (!(await file.exists())) continue;
	const lines = (await file.text()).split("\n");
	const out: string[] = [];
	let refs: string[] = [];
	const flush = () => {
		if (refs.length > 0) {
			out.push(...refs.sort());
			refs = [];
		}
	};
	for (const line of lines) {
		if (line.startsWith("#: ")) {
			refs.push(line);
		} else {
			flush();
			out.push(line);
		}
	}
	flush();
	const next = out.join("\n");
	if (next !== lines.join("\n")) {
		await Bun.write(path, next);
		console.log(`sorted references: ${locale}/messages.po`);
	}
}
