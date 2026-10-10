"use client";

import { useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { useInvalidateHiring } from "../../../../hooks/useInvalidateHiring";

type Candidate = RouterOutputs["hiring"]["get"]["candidate"];
type EditableField =
	| "email"
	| "phone"
	| "currentTitle"
	| "currentCompany"
	| "githubUrl"
	| "linkedinUrl"
	| "xUrl"
	| "siteUrl"
	| "waasUrl"
	| "referredBy";

interface CandidateDetailsProps {
	candidate: Candidate;
}

export function CandidateDetails({ candidate }: CandidateDetailsProps) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const invalidate = useInvalidateHiring();
	const update = useMutation(
		trpc.hiring.updateCandidate.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		}),
	);

	const fields: { key: EditableField; label: string; isLink?: boolean }[] = [
		{ key: "email", label: t({ message: "Email" }) },
		{ key: "phone", label: t({ message: "Phone" }) },
		{ key: "currentTitle", label: t({ message: "Current title" }) },
		{ key: "currentCompany", label: t({ message: "Company" }) },
		{ key: "githubUrl", label: "GitHub", isLink: true },
		{ key: "linkedinUrl", label: "LinkedIn", isLink: true },
		{ key: "xUrl", label: "X", isLink: true },
		{ key: "siteUrl", label: t({ message: "Website" }), isLink: true },
		{ key: "waasUrl", label: "Work at a Startup", isLink: true },
		{ key: "referredBy", label: t({ message: "Referred by" }) },
	];

	return (
		<section className="grid gap-3">
			{fields.map(({ key, label, isLink }) => {
				const value = candidate[key] ?? "";
				const id = `candidate-${candidate.id}-${key}`;
				return (
					<div key={key} className="space-y-1">
						<Label htmlFor={id} className="text-muted-foreground text-xs">
							{isLink && value ? (
								<a
									href={value}
									target="_blank"
									rel="noreferrer"
									className="hover:text-foreground underline"
								>
									{label}
								</a>
							) : (
								label
							)}
						</Label>
						<Input
							id={id}
							key={value}
							defaultValue={value}
							className="h-8"
							onBlur={(event) => {
								if (event.target.value !== value) {
									update.mutate({
										candidateId: candidate.id,
										[key]: event.target.value,
									});
								}
							}}
						/>
					</div>
				);
			})}
		</section>
	);
}
