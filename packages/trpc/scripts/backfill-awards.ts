import { db } from "@superset/db/client";
import { publicProfiles } from "@superset/db/schema";
import {
	recomputeAwards,
	recomputeTier,
	recomputeTotals,
} from "../src/router/leaderboard/leaderboard";

async function main() {
	const recompute = process.argv.includes("--recompute");

	const profiles = await db
		.select({ userId: publicProfiles.userId, handle: publicProfiles.handle })
		.from(publicProfiles);

	let awarded = 0;

	for (const profile of profiles) {
		if (recompute) {
			await recomputeTotals(profile.userId);
			await recomputeTier(profile.userId);
		}
		const fresh = await recomputeAwards(profile.userId);
		if (fresh.length > 0) {
			awarded += fresh.length;
			const held = fresh
				.map((award) => `${award.slug}:${award.tier}`)
				.join(", ");
			console.log(`@${profile.handle} +${fresh.length} — ${held}`);
		}
	}

	console.log(
		`\n${profiles.length} profiles scanned, ${awarded} new awards granted.`,
	);
}

await main();
