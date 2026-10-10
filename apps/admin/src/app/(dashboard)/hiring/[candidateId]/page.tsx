"use client";

import { Trans } from "@lingui/react/macro";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { LuArrowLeft } from "react-icons/lu";

import { CandidateView } from "../components/CandidateView";
import { useCandidateNav } from "../hooks/useCandidateNav";

export default function CandidatePage() {
	const { candidateId } = useParams<{ candidateId: string }>();
	const router = useRouter();
	const { position } = useCandidateNav(candidateId);

	const prevId = position?.prevId;
	const nextId = position?.nextId;
	const goPrev = useCallback(
		() => prevId && router.replace(`/hiring/${prevId}`),
		[prevId, router],
	);
	const goNext = useCallback(
		() => nextId && router.replace(`/hiring/${nextId}`),
		[nextId, router],
	);

	return (
		<div className="space-y-4">
			<Link
				href="/hiring?tab=pipeline"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<LuArrowLeft className="size-4" />
				<Trans>Pipeline</Trans>
			</Link>
			<CandidateView
				candidateId={candidateId}
				position={position}
				onPrev={prevId ? goPrev : undefined}
				onNext={nextId ? goNext : undefined}
			/>
		</div>
	);
}
