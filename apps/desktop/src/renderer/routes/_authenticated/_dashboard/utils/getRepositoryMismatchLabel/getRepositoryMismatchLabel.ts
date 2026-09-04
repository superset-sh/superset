import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

interface RepositorySearchPage {
	repoMismatch?: string;
}

export function getRepositoryMismatchLabel(
	responses: readonly (RepositorySearchPage | null | undefined)[],
	resultCount: number,
): string | null {
	if (resultCount > 0) return null;
	if (
		responses.length === 0 ||
		responses.some((response) => response == null)
	) {
		return null;
	}

	const pages = responses.filter(
		(response): response is RepositorySearchPage => response != null,
	);
	if (pages.some((page) => !page.repoMismatch)) {
		return null;
	}

	const repositories = new Set(
		pages.flatMap((page) => (page.repoMismatch ? [page.repoMismatch] : [])),
	);
	return repositories.size === 1
		? (repositories.values().next().value ?? null)
		: i18n._(
				msg({
					message: "one of the selected repositories",
				}),
			);
}
