"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import type { HiringOutcome, HiringStage } from "@superset/db/enums";
import { useFormat } from "@superset/i18n/react";
import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useTRPC } from "@/trpc/react";

import { useHiringLabels } from "../../../../hooks/useHiringLabels";
import { useInvalidateHiring } from "../../../../hooks/useInvalidateHiring";

type HiringEvent = RouterOutputs["hiring"]["get"]["events"][number];
const COMPOSER_KINDS = ["note", "interview", "reply", "outreach"] as const;
type ComposerKind = (typeof COMPOSER_KINDS)[number];

interface EventTimelineProps {
	candidateId: string;
	applicationId: string | null;
	events: HiringEvent[];
}

export function EventTimeline({
	candidateId,
	applicationId,
	events,
}: EventTimelineProps) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useHiringLabels();
	const { formatDateTime } = useFormat();
	const invalidate = useInvalidateHiring();
	const [kind, setKind] = useState<ComposerKind>("note");
	const [body, setBody] = useState("");
	const addEvent = useMutation(
		trpc.hiring.addEvent.mutationOptions({
			onSuccess: () => {
				setBody("");
				return invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = () => {
		if (!body.trim() || addEvent.isPending) return;
		addEvent.mutate({ candidateId, applicationId, kind, body });
	};

	const describeChange = (event: HiringEvent) => {
		const meta = event.metadata;
		if (event.kind === "stage_change" && meta?.toStage) {
			const from = meta.fromStage
				? labels.stage[meta.fromStage as HiringStage]
				: "";
			const to = labels.stage[meta.toStage as HiringStage];
			return `${from} → ${to}`;
		}
		if (event.kind === "outcome_change" && meta?.toOutcome) {
			return labels.outcome[meta.toOutcome as HiringOutcome];
		}
		return null;
	};

	return (
		<section className="space-y-4">
			<div className="space-y-2">
				<Textarea
					rows={3}
					value={body}
					onChange={(event) => setBody(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						}
					}}
					placeholder={t({ message: "Add a note… (⌘↵ to save)" })}
				/>
				<div className="flex items-center justify-between gap-2">
					<Select
						value={kind}
						onValueChange={(value) => setKind(value as ComposerKind)}
					>
						<SelectTrigger className="w-36" size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{COMPOSER_KINDS.map((value) => (
								<SelectItem key={value} value={value}>
									{labels.eventKind[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						size="sm"
						onClick={submit}
						disabled={!body.trim() || addEvent.isPending}
					>
						<Trans>Save</Trans>
					</Button>
				</div>
			</div>

			<ol className="space-y-3">
				{events.map((event) => (
					<li key={event.id} className="border-l-2 pl-3">
						<div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
							<Badge variant="outline">{labels.eventKind[event.kind]}</Badge>
							<span>{event.authorLabel ?? event.authorName}</span>
							{event.authorLabel && (
								<Badge variant="secondary">
									<Trans>agent</Trans>
								</Badge>
							)}
							<span>{formatDateTime(new Date(event.occurredAt))}</span>
						</div>
						{describeChange(event) && (
							<p className="mt-1 text-sm">{describeChange(event)}</p>
						)}
						{event.body && (
							<p className="mt-1 text-sm whitespace-pre-wrap">{event.body}</p>
						)}
					</li>
				))}
			</ol>
		</section>
	);
}
