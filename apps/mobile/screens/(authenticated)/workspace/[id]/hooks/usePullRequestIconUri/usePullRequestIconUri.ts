import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import {
	PULL_REQUEST_ASSET,
	type PullRequestStatus,
} from "../../utils/pullRequest";

/**
 * A local file URI for a pull request's mark, for the native composer.
 *
 * SwiftUI cannot read a Metro asset reference any more than the session tab
 * strip's brand marks can, so the bundled art is resolved with `expo-asset`
 * first — the same round trip `useAgentIconUris` makes, for the same reason.
 *
 * Null until the first resolve lands. The caller pairs it with an SF Symbol
 * the composer draws in the meantime, so the chip never appears empty.
 */
export function usePullRequestIconUri(
	status: PullRequestStatus | null,
): string | null {
	const [uris, setUris] = useState<Partial<Record<PullRequestStatus, string>>>(
		{},
	);

	useEffect(() => {
		if (!status || uris[status]) return;
		let cancelled = false;
		void Asset.fromModule(PULL_REQUEST_ASSET[status])
			.downloadAsync()
			.then((asset) => {
				if (cancelled || !asset.localUri) return;
				// Kept alongside whatever resolved before: a workspace whose PR is
				// merged mid-session would otherwise blank its chip while the new
				// mark loads.
				setUris((previous) =>
					previous[status]
						? previous
						: { ...previous, [status]: asset.localUri },
				);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [status, uris]);

	return status ? (uris[status] ?? null) : null;
}
