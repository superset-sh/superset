"use client";

import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { ApplicationEditor } from "./components/ApplicationEditor";
import { CandidateDetails } from "./components/CandidateDetails";
import {
	CandidateHeader,
	type CandidatePosition,
} from "./components/CandidateHeader";
import { EventTimeline } from "./components/EventTimeline";
import { useListKeys } from "./hooks/useListKeys";

interface CandidateViewProps {
	candidateId: string;
	applicationId?: string;
	position?: CandidatePosition | null;
	onPrev?: () => void;
	onNext?: () => void;
}

export function CandidateView({
	candidateId,
	applicationId,
	position,
	onPrev,
	onNext,
}: CandidateViewProps) {
	const trpc = useTRPC();
	const query = useQuery(trpc.hiring.get.queryOptions({ candidateId }));
	useListKeys(onPrev, onNext);

	if (query.isLoading) {
		return (
			<div className="flex justify-center py-16">
				<Spinner />
			</div>
		);
	}
	if (!query.data) {
		return (
			<p className="text-muted-foreground py-16 text-center text-sm">
				<Trans>Candidate not found.</Trans>
			</p>
		);
	}

	const detail = query.data;
	const primary =
		detail.applications.find((app) => app.applicationId === applicationId) ??
		detail.applications.find((app) => app.outcome === "active") ??
		detail.applications[0];

	return (
		<div className="@container space-y-6">
			<CandidateHeader
				detail={detail}
				application={primary}
				position={position}
				onPrev={onPrev}
				onNext={onNext}
			/>
			<div className="grid gap-8 @2xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
				<aside className="space-y-6">
					{detail.applications.map((application) => (
						<ApplicationEditor
							key={application.applicationId}
							application={application}
						/>
					))}
					<CandidateDetails candidate={detail.candidate} />
				</aside>
				<EventTimeline
					candidateId={detail.candidate.id}
					applicationId={primary?.applicationId ?? null}
					events={detail.events}
				/>
			</div>
		</div>
	);
}
