import { msg } from "@lingui/core/macro";
import { i18n } from "./i18n";

export interface AccountLabelSource {
	nickname?: string | null;
	externalUserLabel?: string | null;
	externalAccountLabel?: string | null;
}

export function accountIdentity(source: AccountLabelSource): string | null {
	return source.externalUserLabel ?? source.externalAccountLabel ?? null;
}

export function accountLabels(
	source: AccountLabelSource,
	connectorName: string,
): { title: string; subtitle: string | null } {
	const title =
		source.nickname ||
		accountIdentity(source) ||
		i18n._(
			msg({
				message: `${connectorName} account`,
			}),
		);
	const under = [source.externalUserLabel, source.externalAccountLabel].filter(
		(label, index, all): label is string =>
			Boolean(label) && label !== title && all.indexOf(label) === index,
	);
	return { title, subtitle: under.length > 0 ? under.join(" · ") : null };
}
