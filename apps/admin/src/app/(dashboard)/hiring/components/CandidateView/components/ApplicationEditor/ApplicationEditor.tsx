"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	type HiringScore,
	type HiringStage,
	hiringScoreValues,
	hiringStageValues,
} from "@superset/db/enums";
import type { RouterOutputs } from "@superset/trpc";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { useHiringLabels } from "../../../../hooks/useHiringLabels";
import { useInvalidateHiring } from "../../../../hooks/useInvalidateHiring";

const NONE = "none";

interface ApplicationEditorProps {
	application: RouterOutputs["hiring"]["get"]["applications"][number];
}

export function ApplicationEditor({ application }: ApplicationEditorProps) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useHiringLabels();
	const invalidate = useInvalidateHiring();
	const owners = useQuery(trpc.hiring.owners.queryOptions());
	const update = useMutation(
		trpc.hiring.updateApplication.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		}),
	);
	const currentOwnerListed =
		!application.ownerUserId ||
		owners.data?.some((owner) => owner.id === application.ownerUserId);
	const ownerOptions = [
		...(owners.data ?? []),
		...(currentOwnerListed || !application.ownerUserId
			? []
			: [{ id: application.ownerUserId, name: application.ownerName ?? "" }]),
	];
	const save = (
		changes: Omit<Parameters<typeof update.mutate>[0], "applicationId">,
	) => update.mutate({ applicationId: application.applicationId, ...changes });

	return (
		<section className="space-y-3 rounded-lg border p-4">
			<h3 className="text-sm font-medium">{application.roleTitle}</h3>
			<div className="grid gap-3">
				<div className="space-y-1.5">
					<Label>
						<Trans>Stage</Trans>
					</Label>
					<Select
						value={application.stage}
						onValueChange={(value) => save({ stage: value as HiringStage })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{hiringStageValues.map((value) => (
								<SelectItem key={value} value={value}>
									{labels.stage[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label>
						<Trans>Owner</Trans>
					</Label>
					<Select
						value={application.ownerUserId ?? NONE}
						onValueChange={(value) =>
							save({ ownerUserId: value === NONE ? null : value })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>
								<Trans>Nobody</Trans>
							</SelectItem>
							{ownerOptions.map((owner) => (
								<SelectItem key={owner.id} value={owner.id}>
									{owner.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label>
						<Trans>Score</Trans>
					</Label>
					<Select
						value={application.score ?? NONE}
						onValueChange={(value) =>
							save({ score: value === NONE ? null : (value as HiringScore) })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>
								<Trans>Not scored</Trans>
							</SelectItem>
							{hiringScoreValues.map((value) => (
								<SelectItem key={value} value={value}>
									{labels.score[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-3">
					<div className="space-y-1.5">
						<Label htmlFor={`next-step-${application.applicationId}`}>
							<Trans>Next step</Trans>
						</Label>
						<Input
							id={`next-step-${application.applicationId}`}
							key={application.nextStep ?? ""}
							defaultValue={application.nextStep ?? ""}
							placeholder={t({ message: "What happens next" })}
							onBlur={(event) => {
								if (event.target.value !== (application.nextStep ?? "")) {
									save({ nextStep: event.target.value });
								}
							}}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`follow-up-${application.applicationId}`}>
							<Trans>Follow-up</Trans>
						</Label>
						<Input
							id={`follow-up-${application.applicationId}`}
							type="date"
							key={application.nextFollowUpOn ?? ""}
							defaultValue={application.nextFollowUpOn ?? ""}
							onBlur={(event) => {
								const value = event.target.value || null;
								if (value !== application.nextFollowUpOn) {
									save({ nextFollowUpOn: value });
								}
							}}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
