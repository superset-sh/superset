import { z } from "zod";

/**
 * The identity contract for every id a host authors and this app persists.
 * Hosts mint these with `randomUUID()`, but their SQLite columns are plain
 * `text` and callers may supply their own id, so nothing host-side enforces
 * the shape.
 *
 * The local collections that key rows on these ids validate them as UUIDs, as
 * do the cloud procedures that still accept a workspace or project id. Both
 * sides share this one schema so the ingest filter below can never become more
 * lenient than the collections it protects.
 */
export const hostAuthoredIdSchema = z.string().uuid();

export function isHostAuthoredId(value: unknown): value is string {
	return hostAuthoredIdSchema.safeParse(value).success;
}

/**
 * Warn once per offending value — feeds re-merge on every host refetch. The
 * warning is also the Sentry breadcrumb: `breadcrumbsIntegration` is on by
 * default with `console: true`, so this lands on the scope of whatever the app
 * reports next without a second, duplicate `addBreadcrumb` call.
 */
const reportedIds = new Set<string>();

function reportQuarantinedRow(
	kind: string,
	field: string,
	value: unknown,
): void {
	const reportKey = `${kind}:${field}:${String(value)}`;
	if (reportedIds.has(reportKey)) return;
	reportedIds.add(reportKey);

	console.warn(
		`[host-rows] Quarantined ${kind} row: ${field} is not a valid id (${JSON.stringify(value)})`,
	);
}

/**
 * Drop host-served rows carrying an id this app cannot represent, so one bad
 * row degrades to a hidden row instead of taking the app down.
 *
 * TanStack DB enforces the id contract by throwing `SchemaValidationError` out
 * of `insert`/`update` — synchronously, inside the effect that places host
 * workspaces in the sidebar, where nothing catches it and the root error
 * boundary swallows the whole dashboard. Rejecting the row where host data
 * enters keeps that invariant true for every consumer downstream, instead of
 * loosening the schema or wrapping the writes in a catch.
 */
export function filterRepresentableHostRows<TRow>(
	rows: readonly TRow[],
	kind: string,
	getIds: (row: TRow) => Record<string, unknown>,
): readonly TRow[] {
	return rows.filter((row) =>
		Object.entries(getIds(row)).every(([field, value]) => {
			// An explicit null is an absence (a project-less session), not a
			// violation. Undefined is not: the row is missing the field, and
			// letting that through would pass a row with no id at all.
			if (value === null) return true;
			if (isHostAuthoredId(value)) return true;
			reportQuarantinedRow(kind, field, value);
			return false;
		}),
	);
}
