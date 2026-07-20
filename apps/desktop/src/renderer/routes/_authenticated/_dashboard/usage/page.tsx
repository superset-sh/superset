import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { NoDataStrip } from "./components/NoDataStrip";
import { ProviderCard } from "./components/ProviderCard";
import { UsageSettingsPopover } from "./components/UsageSettingsPopover";
import type { ProviderId, ProviderSnapshot } from "./types";

export const Route = createFileRoute("/_authenticated/_dashboard/usage/")({
	component: UsagePage,
});

const PROVIDER_ORDER: ProviderId[] = ["claude", "codex", "copilot", "gemini"];

function UsagePage() {
	const initial = electronTrpc.usage.getSnapshot.useQuery();
	const [snapshots, setSnapshots] = useState<ProviderSnapshot[]>([]);
	electronTrpc.usage.subscribe.useSubscription(undefined, {
		onData: setSnapshots,
	});
	const refresh = electronTrpc.usage.refresh.useMutation({
		onSuccess: setSnapshots,
	});

	// The subscription pushes the cached value immediately, but seeding from the
	// query avoids a blank first paint before that arrives.
	const active = snapshots.length > 0 ? snapshots : (initial.data ?? []);
	const byProvider = new Map(active.map((s) => [s.providerId, s]));

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<h1 className="text-sm font-semibold tracking-tight">Token Usage</h1>
				<div className="flex items-center gap-1">
					<UsageSettingsPopover />
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 px-3"
						onClick={() => refresh.mutate()}
						disabled={refresh.isPending}
					>
						<LuRefreshCw
							className={cn("size-4", refresh.isPending && "animate-spin")}
						/>
						<span>Refresh</span>
					</Button>
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
				<div className="mx-auto flex w-full max-w-[540px] flex-col gap-4">
					{PROVIDER_ORDER.map((providerId) => (
						<ProviderCard
							key={providerId}
							providerId={providerId}
							snapshot={byProvider.get(providerId)}
						/>
					))}
					<NoDataStrip />
				</div>
			</div>
		</div>
	);
}
