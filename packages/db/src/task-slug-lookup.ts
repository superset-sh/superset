import { arrayContains, asc, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { tasks } from "./schema";

/**
 * Matches a task by its current slug or any slug it had before. A Linear push
 * replaces a title slug with the issue key, and links shared before that must
 * keep resolving. Order with `taskSlugLookupOrder` so the current slug wins.
 */
export function taskSlugMatches(slug: string): SQL {
	const match = or(
		eq(tasks.slug, slug),
		arrayContains(tasks.previousSlugs, [slug]),
	);
	if (!match) throw new Error("unreachable");
	return match;
}

export function taskSlugLookupOrder(slug: string): SQL[] {
	return [desc(eq(tasks.slug, slug)), asc(tasks.createdAt)];
}

/**
 * Value for `previousSlugs` in an UPDATE that sets `slug` to `next`: records
 * the slug being replaced, unless it is unchanged.
 */
export function retireTaskSlug(next: string): SQL {
	return sql`CASE WHEN ${tasks.slug} = ${next} THEN ${tasks.previousSlugs} ELSE array_append(${tasks.previousSlugs}, ${tasks.slug}) END`;
}

/** Same as `retireTaskSlug` for an ON CONFLICT DO UPDATE that sets `slug`. */
export function retireTaskSlugOnConflict(): SQL {
	return sql`CASE WHEN ${tasks.slug} = excluded.slug THEN ${tasks.previousSlugs} ELSE array_append(${tasks.previousSlugs}, ${tasks.slug}) END`;
}

/** True when any previous slug matches the ILIKE pattern. */
export function taskHadSlugLike(pattern: string): SQL {
	return sql`EXISTS (SELECT 1 FROM unnest(${tasks.previousSlugs}) AS previous_slug WHERE previous_slug ILIKE ${pattern})`;
}
