import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { ConfigFilePreview } from "renderer/components/ConfigFilePreview";
import { trpc } from "renderer/lib/trpc";
import {
	useCloseConfigModal,
	useConfigModalOpen,
	useConfigModalProjectId,
} from "renderer/stores/config-modal";
import { CONFIG_FILE_NAME, WEBSITE_URL } from "shared/constants";

export function SetupConfigModal() {
	const isOpen = useConfigModalOpen();
	const projectId = useConfigModalProjectId();
	const closeModal = useCloseConfigModal();

	const { data: project } = trpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);

	const { data: configFilePath } = trpc.config.getConfigFilePath.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);

	const projectName = project?.name ?? "your-project";

	const handleLearnMore = () => {
		window.open(`${WEBSITE_URL}/scripts`, "_blank");
	};

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && closeModal()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Configure scripts</DialogTitle>
					<DialogDescription>
						Edit {CONFIG_FILE_NAME} to automate setting up workspaces and running your
						app.
					</DialogDescription>
				</DialogHeader>

				<ConfigFilePreview
					projectName={projectName}
					configFilePath={configFilePath ?? undefined}
					className="mt-4"
				/>

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
