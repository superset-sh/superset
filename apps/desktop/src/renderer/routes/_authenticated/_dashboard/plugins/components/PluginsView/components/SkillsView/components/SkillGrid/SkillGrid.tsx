import type { ReactNode } from "react";
import type { SkillListItem } from "../../hooks/useSkills";
import { SkillCard } from "../SkillCard";

interface SkillGridProps {
	skills: SkillListItem[];
	isBusy: boolean;
	showScope?: boolean;
	duplicateNames?: ReadonlySet<string>;
	emptyMessage: ReactNode;
	onOpen: (skill: SkillListItem) => void;
	onDelete: (skill: SkillListItem) => void;
	onSetEnabled: (name: string, enabled: boolean) => void;
}

export function SkillGrid({
	skills,
	isBusy,
	showScope,
	duplicateNames,
	emptyMessage,
	onOpen,
	onDelete,
	onSetEnabled,
}: SkillGridProps) {
	if (skills.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				{emptyMessage}
			</p>
		);
	}
	return (
		<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
			{skills.map((skill) => (
				<SkillCard
					key={skill.id}
					skill={skill}
					isBusy={isBusy}
					showScope={showScope}
					showPath={duplicateNames?.has(skill.name)}
					onOpen={onOpen}
					onDelete={onDelete}
					onSetEnabled={onSetEnabled}
				/>
			))}
		</div>
	);
}
