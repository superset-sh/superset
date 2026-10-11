import { msg } from "@lingui/core/macro";
import { useLingui as useTranslation } from "@lingui/react";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";
import type { V1AttentionItem } from "renderer/lib/v1-migration/attention";

interface AttentionItemRowProps {
	item: V1AttentionItem;
	onImport: (item: V1AttentionItem) => Promise<void>;
}

export function AttentionItemRow({ item, onImport }: AttentionItemRowProps) {
	const { _: translate } = useTranslation();
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const runImport = async () => {
		setImporting(true);
		setError(null);
		try {
			await onImport(item);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setImporting(false);
		}
	};

	return (
		<li className="flex min-w-0 items-center gap-2">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm">{item.name}</p>
				<p className="truncate font-mono text-muted-foreground text-xs">
					{item.path}
				</p>
				{error ? (
					<p className="text-destructive text-xs [overflow-wrap:anywhere]">
						{error}
					</p>
				) : null}
			</div>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-7 shrink-0 px-2.5 text-xs"
				disabled={importing}
				onClick={() => {
					void runImport();
				}}
			>
				{importing ? <Spinner className="size-3" /> : null}
				{translate(msg({ message: "Import" }))}
			</Button>
		</li>
	);
}
