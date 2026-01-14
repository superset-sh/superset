import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { OpenInButton } from "renderer/components/OpenInButton";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useCloseConfigModal,
	useConfigModalOpen,
	useConfigModalProjectId,
} from "renderer/stores/config-modal";

const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}`;

export function SetupConfigModal() {
	const isOpen = useConfigModalOpen();
	const projectId = useConfigModalProjectId();
	const closeModal = useCloseConfigModal();

	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);

	const { data: configFilePath } =
		electronTrpc.config.getConfigFilePath.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const projectName = project?.name ?? "your-project";

	const handleLearnMore = () => {
		window.open(COMPANY.SCRIPTS_URL, "_blank");
	};

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && closeModal()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Configure scripts</DialogTitle>
					<DialogDescription>
						Edit config.json to automate setting up workspaces and running your
						app.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
					{/* Header */}
					<div className="flex items-center justify-between gap-6 px-4 py-3 border-b border-border">
						<span className="text-sm text-muted-foreground font-mono">
							{projectName}/.superset/config.json
						</span>
						<OpenInButton
							path={configFilePath ?? undefined}
							label="config.json"
						/>
					</div>

					{/* Code preview */}
					<div className="p-4 bg-background/50">
						<pre className="text-sm font-mono text-foreground leading-relaxed">
							{CONFIG_TEMPLATE}
						</pre>
					</div>
				</div>

				<div className="mt-4">
					<Button
						variant="outline"
						size="sm"
						onClick={handleLearnMore}
						className="gap-2"
					>
						Learn how to use scripts
						<HiArrowTopRightOnSquare className="h-4 w-4" />
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
