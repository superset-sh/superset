import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import type { ReactNode } from "react";
import type { ImportSourceTab } from "../ExistingWorktreesList";
import { ExistingWorktreesList } from "../ExistingWorktreesList";

interface ImportFlowProps {
	projectId: string;
	projectSelector: ReactNode;
	onOpenSuccess: () => void;
	activeTab: ImportSourceTab;
	onActiveTabChange: (tab: ImportSourceTab) => void;
}

export function ImportFlow({
	projectId,
	projectSelector,
	onOpenSuccess,
	activeTab,
	onActiveTabChange,
}: ImportFlowProps) {
	return (
		<div className="space-y-3">
			<div className="min-w-0 overflow-x-auto">
				<Tabs
					value={activeTab}
					onValueChange={(value) => onActiveTabChange(value as ImportSourceTab)}
				>
					<TabsList className="h-8 bg-transparent p-0 gap-1 w-max min-w-full justify-start">
						<TabsTrigger
							value="pull-request"
							className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
						>
							Pull request
						</TabsTrigger>
						<TabsTrigger
							value="branches"
							className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
						>
							Branches
						</TabsTrigger>
						<TabsTrigger
							value="worktrees"
							className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
						>
							Worktrees
						</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>
			<div>{projectSelector}</div>
			<ExistingWorktreesList
				projectId={projectId}
				onOpenSuccess={onOpenSuccess}
				activeTab={activeTab}
				onActiveTabChange={onActiveTabChange}
				showTabs={false}
			/>
		</div>
	);
}
