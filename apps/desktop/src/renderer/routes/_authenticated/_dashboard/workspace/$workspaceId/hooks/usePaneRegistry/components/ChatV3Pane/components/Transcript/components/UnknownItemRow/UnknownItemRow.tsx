import { Trans } from "@lingui/react/macro";
import type { Item } from "@superset/chat/protocol";

export function UnknownItemRow({ item }: { item: Item }) {
	return (
		<details className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
			<summary>
				<Trans>Unsupported item "{item.kind}"</Trans>
			</summary>
			<pre className="mt-1 overflow-x-auto whitespace-pre-wrap">
				{JSON.stringify(item, null, 2)}
			</pre>
		</details>
	);
}
