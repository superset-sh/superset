"use client";

import { Trans } from "@lingui/react/macro";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useRouter } from "next/navigation";
import { Suspense } from "react";

import { AddCandidateDialog } from "./components/AddCandidateDialog";
import { PipelineTab } from "./components/PipelineTab";
import { TodayTab } from "./components/TodayTab";
import { useSearchParamState } from "./hooks/useSearchParamState";

function HiringPageContent() {
	const router = useRouter();
	const [tab, setTab] = useSearchParamState("tab");

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">
						<Trans>Hiring</Trans>
					</h1>
					<p className="text-muted-foreground">
						<Trans>
							Every candidate, where they are, and who owes the next move.
						</Trans>
					</p>
				</div>
				<AddCandidateDialog
					onCreated={(candidateId) => router.push(`/hiring/${candidateId}`)}
				/>
			</div>

			<Tabs
				value={tab === "pipeline" ? "pipeline" : "today"}
				onValueChange={(value) => setTab(value === "today" ? null : value)}
			>
				<TabsList>
					<TabsTrigger value="today">
						<Trans>Today</Trans>
					</TabsTrigger>
					<TabsTrigger value="pipeline">
						<Trans>Pipeline</Trans>
					</TabsTrigger>
				</TabsList>
				<TabsContent value="today" className="pt-4">
					<TodayTab />
				</TabsContent>
				<TabsContent value="pipeline" className="pt-4">
					<PipelineTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}

export default function HiringPage() {
	return (
		<Suspense>
			<HiringPageContent />
		</Suspense>
	);
}
