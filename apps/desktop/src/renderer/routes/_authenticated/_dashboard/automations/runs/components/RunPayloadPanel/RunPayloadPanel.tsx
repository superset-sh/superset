import { Trans } from "@lingui/react/macro";
import { Skeleton } from "@superset/ui/skeleton";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface RunPayloadPanelProps {
	runId: string;
}

export function RunPayloadPanel({ runId }: RunPayloadPanelProps) {
	const { data, isPending, isError } = cloudTrpc.automation.runPayload.useQuery(
		{ runId },
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	if (isPending) {
		return <Skeleton className="h-24 w-full" />;
	}

	if (isError) {
		return (
			<p className="text-muted-foreground text-xs">
				<Trans>Couldn't load this run's payload.</Trans>
			</p>
		);
	}

	if (data.payload === null) {
		return (
			<p className="text-muted-foreground text-xs">
				<Trans>No payload is stored for this run.</Trans>
			</p>
		);
	}

	return (
		<pre className="max-h-80 select-text cursor-text overflow-auto rounded-md bg-accent/30 p-3 font-mono text-[11px] leading-relaxed">
			{JSON.stringify(data.payload, null, 2)}
		</pre>
	);
}
