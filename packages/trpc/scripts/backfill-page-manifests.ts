import { db } from "@superset/db/client";
import { pages } from "@superset/db/schema";
import { asc } from "drizzle-orm";
import { writePageManifest } from "../src/router/page/storage";

const apply = process.argv.includes("--apply");
const BATCH = 50;

const rows = await db
	.select({ id: pages.id, slug: pages.slug })
	.from(pages)
	.orderBy(asc(pages.createdAt));

console.log(
	`${rows.length} page(s) to rewrite${apply ? "" : " (dry run; pass --apply)"}`,
);
if (!apply) process.exit(0);

let done = 0;
const failed: { id: string; slug: string; error: string }[] = [];

for (let index = 0; index < rows.length; index += BATCH) {
	const batch = rows.slice(index, index + BATCH);
	await Promise.all(
		batch.map(async (page) => {
			try {
				await writePageManifest(page.id);
				done += 1;
			} catch (error) {
				failed.push({
					id: page.id,
					slug: page.slug,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}),
	);
	console.log(`  ${Math.min(index + BATCH, rows.length)}/${rows.length}`);
}

console.log(`rewrote ${done} manifest(s)`);
if (failed.length > 0) {
	console.error(`${failed.length} failed:`);
	for (const row of failed) {
		console.error(`  ${row.slug} (${row.id}): ${row.error}`);
	}
	process.exit(1);
}
