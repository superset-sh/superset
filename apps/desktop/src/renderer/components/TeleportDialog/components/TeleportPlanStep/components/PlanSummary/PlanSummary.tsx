import { Plural, Trans } from "@lingui/react/macro";
import type { TeleportPlan } from "@superset/shared/teleport";

interface PlanSummaryProps {
	plan: TeleportPlan;
	hostName: string;
}

/**
 * What moves, and what the destination will do on the user's behalf.
 *
 * The second half matters as much as the first: "clones the repository
 * there first" is the difference between a teleport that looks stuck and
 * one the user understands is doing a big thing once.
 */
export function PlanSummary({ plan, hostName }: PlanSummaryProps) {
	return (
		<div className="space-y-1 text-sm">
			<Row label={<Trans>Branch</Trans>}>
				<span className="font-mono text-xs">{plan.branch}</span>
				{plan.workingTree.unpushedCommits > 0 && (
					<span className="text-muted-foreground">
						{" · "}
						<Plural
							value={plan.workingTree.unpushedCommits}
							one="# unpushed commit"
							other="# unpushed commits"
						/>
					</span>
				)}
			</Row>

			<Row label={<Trans>Changes</Trans>}>
				{plan.isEmpty ? (
					<span className="text-muted-foreground">
						<Trans>Nothing uncommitted — the branch moves on its own</Trans>
					</span>
				) : (
					<ChangeCounts plan={plan} />
				)}
			</Row>

			<Row label={<Trans>Repo</Trans>}>
				{plan.repository === "clone" ? (
					<Trans>Clones the repository on {hostName} first</Trans>
				) : (
					<Trans>Already on {hostName} · fetch only</Trans>
				)}
			</Row>
		</div>
	);
}

function ChangeCounts({ plan }: { plan: TeleportPlan }) {
	const { modified, untracked, preciousFiles } = plan.workingTree;
	const parts = [
		modified > 0 && (
			<Plural key="m" value={modified} one="# modified" other="# modified" />
		),
		untracked > 0 && (
			<Plural key="u" value={untracked} one="# untracked" other="# untracked" />
		),
		// Named rather than counted with the rest: a user who sees "2 env
		// files" learns that their secrets travel, which nothing else says.
		preciousFiles > 0 && (
			<Plural
				key="p"
				value={preciousFiles}
				one="# env file"
				other="# env files"
			/>
		),
	].filter(Boolean);

	return (
		<>
			{parts.map((part, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered parts
				<span key={index}>
					{index > 0 && ", "}
					{part}
				</span>
			))}
		</>
	);
}

function Row({
	label,
	children,
}: {
	label: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex gap-2">
			<span className="w-16 shrink-0 text-muted-foreground text-xs leading-5">
				{label}
			</span>
			<span className="min-w-0 flex-1">{children}</span>
		</div>
	);
}
