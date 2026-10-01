import { Trans } from "@lingui/react/macro";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import type { CloudWorkspaceListItem } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacesList/components/CloudWorkspaceListRow";
import { DescriptionEditor } from "renderer/routes/_authenticated/_dashboard/components/DescriptionEditor";
import { RecordLayout } from "renderer/routes/_authenticated/_dashboard/components/RecordLayout";
import type {
	ProjectRecord,
	ProjectRecordChanges,
	ProjectTab,
} from "../../types";
import { ProjectProgressTab } from "./components/ProjectProgressTab";
import { ProjectRecordHeader } from "./components/ProjectRecordHeader";
import { ProjectRecordSide } from "./components/ProjectRecordSide";
import { ProjectRecordTopBar } from "./components/ProjectRecordTopBar";

interface ProjectRecordViewProps {
	project: ProjectRecord;
	tab: ProjectTab;
	now: Date;
	people: { id: string; name: string; image: string | null }[];
	onTabChange: (tab: ProjectTab) => void;
	onBack: () => void;
	onChange: (changes: ProjectRecordChanges) => void;
	onAddTask: (task: { id: string; slug: string; title: string }) => void;
	onOpenTask: (taskId: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	workspaceItems: CloudWorkspaceListItem[];
	onOpenPullRequest: (url: string) => void;
	onOpenRepo: (fullName: string) => void;
	onSetInSidebar: (workspaceId: string, inSidebar: boolean) => void;
	onInvite?: () => void;
}

export function ProjectRecordView({
	onInvite,
	project,
	tab,
	now,
	people,
	onTabChange,
	onBack,
	onChange,
	onAddTask,
	onOpenTask,
	onOpenWorkspace,
	workspaceItems,
	onOpenPullRequest,
	onOpenRepo,
	onSetInSidebar,
}: ProjectRecordViewProps) {
	return (
		<RecordLayout
			header={
				<ProjectRecordTopBar
					name={project.name}
					icon={project.icon}
					color={project.color}
					onBack={onBack}
				/>
			}
			sideTitle={<Trans>Properties</Trans>}
			side={
				<ProjectRecordSide
					project={project}
					people={people}
					onInvite={onInvite}
					onChange={onChange}
				/>
			}
		>
			<ProjectRecordHeader project={project} onChange={onChange} />
			<Tabs
				value={tab}
				onValueChange={(value) => onTabChange(value as ProjectTab)}
				className="mt-6"
			>
				<TabsList className="h-8">
					<TabsTrigger value="overview" className="px-3 text-xs">
						<Trans>Overview</Trans>
					</TabsTrigger>
					<TabsTrigger value="progress" className="px-3 text-xs">
						<Trans>Progress</Trans>
					</TabsTrigger>
				</TabsList>
			</Tabs>
			<div className="mt-6 max-w-[760px]">
				{tab === "overview" ? (
					<DescriptionEditor
						allowAttachments
						key={project.id}
						description={project.description}
						onSave={(description) => onChange({ description })}
					/>
				) : (
					<ProjectProgressTab
						project={project}
						now={now}
						onAddTask={onAddTask}
						onOpenTask={onOpenTask}
						onOpenWorkspace={onOpenWorkspace}
						workspaceItems={workspaceItems}
						onOpenPullRequest={onOpenPullRequest}
						onOpenRepo={onOpenRepo}
						onSetInSidebar={onSetInSidebar}
					/>
				)}
			</div>
		</RecordLayout>
	);
}
