import {
	type AchievementDef,
	type AchievementMeasure,
	CATALOG,
	earnedTier,
	isRetired,
} from "./achievements";

export type AwardMeasures = Record<AchievementMeasure, number>;

export interface AwardInput extends AwardMeasures {
	on: string;
}

export interface EarnedAward {
	slug: string;
	tier: number;
	value: number;
}

export function evaluateAwards(
	input: AwardInput,
	catalog: readonly AchievementDef[] = CATALOG,
): EarnedAward[] {
	const earned: EarnedAward[] = [];

	for (const def of catalog) {
		if (isRetired(def, input.on)) continue;

		const value = input[def.measure];

		if (def.thresholds.length === 0) {
			if (value > 0) earned.push({ slug: def.slug, tier: 0, value });
			continue;
		}

		const top = earnedTier(def, value);
		for (let level = 1; level <= top; level++) {
			earned.push({ slug: def.slug, tier: level, value });
		}
	}

	return earned;
}

export function longestStreak(days: readonly string[]): number {
	if (days.length === 0) return 0;

	const sorted = [...new Set(days)].sort();
	let best = 1;
	let run = 1;

	for (let index = 1; index < sorted.length; index++) {
		const previous = Date.parse(`${sorted[index - 1]}T00:00:00Z`);
		const current = Date.parse(`${sorted[index]}T00:00:00Z`);
		if (current - previous === 86_400_000) {
			run += 1;
			best = Math.max(best, run);
		} else {
			run = 1;
		}
	}

	return best;
}
