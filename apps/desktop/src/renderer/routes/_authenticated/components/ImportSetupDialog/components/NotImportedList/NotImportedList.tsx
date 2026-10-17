import { Trans, useLingui } from "@lingui/react/macro";
import { HiExclamationTriangle } from "react-icons/hi2";
import type { SetupImportCandidate } from "renderer/hooks/host-service/useSetupImportCandidates";

type NotImportedEntry = SetupImportCandidate["notImported"][number];

interface NotImportedListProps {
	entries: NotImportedEntry[];
}

export function NotImportedList({ entries }: NotImportedListProps) {
	const { t } = useLingui();
	if (entries.length === 0) return null;

	const reasons: Record<NotImportedEntry["reason"], string> = {
		"no-equivalent": t`Superset has no matching setting`,
		"extra-command": t`Extra command; add it as a terminal script if you need it`,
		"unsupported-variable": t`Superset does not set this variable`,
		"invalid-path": t`Not a plain relative path`,
		"too-large": t`Too large to import`,
		"invalid-value": t`Not a value this file accepts`,
	};

	return (
		<div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
			<p className="flex items-center gap-1.5 text-sm font-medium">
				<HiExclamationTriangle className="size-4 text-amber-600 dark:text-amber-400" />
				<Trans>Not imported</Trans>
			</p>
			<ul className="space-y-1 text-xs">
				{entries.map((entry) => (
					<li
						key={`${entry.file}:${entry.field}`}
						className="flex flex-wrap gap-x-1.5"
					>
						<code className="font-mono text-foreground">{entry.field}</code>
						<span className="text-muted-foreground">
							({entry.file}) · {reasons[entry.reason]}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
