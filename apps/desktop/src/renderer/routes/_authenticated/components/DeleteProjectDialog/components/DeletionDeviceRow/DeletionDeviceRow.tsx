import { Plural, Trans } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { Checkbox } from "@superset/ui/checkbox";
import type {
	PersonActivity,
	ProjectDeletionTarget,
} from "../../useDeleteProject.utils";

interface DeletionDeviceRowProps {
	id: string;
	target: ProjectDeletionTarget;
	checked: boolean;
	disabled: boolean;
	othersActivity: PersonActivity[];
	memberName: (userId: string | null) => string | null;
	onCheckedChange: (checked: boolean) => void;
}

export function DeletionDeviceRow({
	id,
	target,
	checked,
	disabled,
	othersActivity,
	memberName,
	onCheckedChange,
}: DeletionDeviceRowProps) {
	return (
		<label
			htmlFor={id}
			className="flex items-start gap-3 rounded-md border p-3 text-sm"
		>
			<Checkbox
				id={id}
				className="mt-0.5"
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onCheckedChange(value === true)}
			/>
			<span className="min-w-0 flex-1 space-y-1">
				<span className="block break-words">{target.name}</span>
				{othersActivity.map((person) => {
					const who = memberName(person.userId);
					const lastActive = person.lastActiveAt
						? formatRelativeTime(person.lastActiveAt)
						: null;
					return (
						<span
							key={person.userId ?? "unknown"}
							className="block text-xs text-muted-foreground"
						>
							{who ?? <Trans>Someone</Trans>}:{" "}
							<Plural
								value={person.runningTerminalCount}
								one="# terminal running"
								other="# terminals running"
							/>
							{person.runningAgentCount > 0 ? (
								<>
									{", "}
									<Plural
										value={person.runningAgentCount}
										one="# agent"
										other="# agents"
									/>
								</>
							) : null}
							{lastActive ? (
								<>
									{" · "}
									<Trans>active {lastActive}</Trans>
								</>
							) : null}
						</span>
					);
				})}
			</span>
			{!target.canDelete ? (
				<span className="text-xs text-muted-foreground">
					<Trans>Owner access required</Trans>
				</span>
			) : !target.isOnline ? (
				<span className="text-xs text-muted-foreground">
					<Trans>Offline</Trans>
				</span>
			) : null}
		</label>
	);
}
