"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { hiringSourceValues } from "@superset/db/enums";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";

import { useTRPC } from "@/trpc/react";

import { useCandidateNav } from "../../hooks/useCandidateNav";
import { useHiringLabels } from "../../hooks/useHiringLabels";
import { ApplicationsTable } from "./components/ApplicationsTable";

const ALL = "all";
type Status = "active" | "closed" | "all";

export function PipelineTab() {
	const { t } = useLingui();
	const router = useRouter();
	const { remember } = useCandidateNav();
	const trpc = useTRPC();
	const labels = useHiringLabels();
	const [q, setQ] = useState("");
	const [roleId, setRoleId] = useState(ALL);
	const [source, setSource] = useState(ALL);
	const [status, setStatus] = useState<Status>("active");
	const deferredQ = useDeferredValue(q);

	const roles = useQuery(trpc.hiring.roles.queryOptions());
	const list = useQuery(
		trpc.hiring.list.queryOptions({
			q: deferredQ || undefined,
			roleId: roleId === ALL ? undefined : roleId,
			source:
				source === ALL
					? undefined
					: (source as (typeof hiringSourceValues)[number]),
			status,
		}),
	);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={q}
					onChange={(event) => setQ(event.target.value)}
					placeholder={t({ message: "Search name, email, company, GitHub" })}
					className="w-72"
				/>
				<Select value={status} onValueChange={(v) => setStatus(v as Status)}>
					<SelectTrigger className="w-32">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="active">
							<Trans>Active</Trans>
						</SelectItem>
						<SelectItem value="closed">
							<Trans>Closed</Trans>
						</SelectItem>
						<SelectItem value="all">
							<Trans>All</Trans>
						</SelectItem>
					</SelectContent>
				</Select>
				<Select value={roleId} onValueChange={setRoleId}>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>
							<Trans>All roles</Trans>
						</SelectItem>
						{roles.data?.map((role) => (
							<SelectItem key={role.id} value={role.id}>
								{role.title}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={source} onValueChange={setSource}>
					<SelectTrigger className="w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>
							<Trans>All sources</Trans>
						</SelectItem>
						{hiringSourceValues.map((value) => (
							<SelectItem key={value} value={value}>
								{labels.source[value]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span className="text-muted-foreground ml-auto text-sm">
					{list.data && <Trans>{list.data.length} candidates</Trans>}
				</span>
			</div>
			<ApplicationsTable
				rows={list.data ?? []}
				onOpen={(candidateId) => {
					remember([...new Set(list.data?.map((row) => row.candidateId))]);
					router.push(`/hiring/${candidateId}`);
				}}
			/>
		</div>
	);
}
