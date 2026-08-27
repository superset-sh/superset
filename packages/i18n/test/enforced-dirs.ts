// Directories (repo-relative) that must contain no hardcoded user-facing JSX
// text — every string in them goes through Lingui. Add a directory here once
// it is fully converted. This list only grows; removing an entry is a
// regression, the same ratchet contract as the no-*-blocking tests.
export const ENFORCED_DIRS: readonly string[] = [
	"packages/i18n/src",
	"apps/web/src/app/account-pending-deletion",
];
