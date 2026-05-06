import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useCloseV1ImportModal,
	useV1ImportModalStore,
	V1_IMPORT_PAGE_ORDER,
} from "renderer/stores/v1-import-modal";
import { MOCK_ORG_ID } from "shared/constants";
import { WelcomePage } from "./components/WelcomePage";
import { ImportPresetsPage } from "./ImportPresetsPage";
import { ImportProjectsPage } from "./ImportProjectsPage";
import { ImportWorkspacesPage } from "./ImportWorkspacesPage";

export function V1ImportModal() {
	const isOpen = useV1ImportModalStore((s) => s.isOpen);
	const page = useV1ImportModalStore((s) => s.page);
	const setPage = useV1ImportModalStore((s) => s.setPage);
	const close = useCloseV1ImportModal();
	const { data: session } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	if (!organizationId) return null;

	const currentIndex = V1_IMPORT_PAGE_ORDER.indexOf(page);
	const previousPage = V1_IMPORT_PAGE_ORDER[currentIndex - 1];
	const nextPage = V1_IMPORT_PAGE_ORDER[currentIndex + 1];

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<DialogContent
				className="!w-[744px] !max-w-[744px] p-0 gap-0 overflow-hidden !rounded-none"
				showCloseButton={false}
				onEscapeKeyDown={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogTitle className="sr-only">
					{page === "welcome" ? "Welcome to Superset v2" : "Import from v1"}
				</DialogTitle>
				<DialogDescription className="sr-only">
					Bring projects, workspaces, and terminal presets from Superset v1 into
					v2.
				</DialogDescription>

				<div key={page} className="animate-in fade-in duration-200">
					{page === "welcome" && <WelcomePage />}
					{(page === "projects" || page === "workspaces") && !activeHostUrl && (
						<div className="flex h-[454px] items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
							Host service is not ready yet. This window will populate as soon
							as the local host service comes online.
						</div>
					)}
					{page === "projects" && activeHostUrl && (
						<ImportProjectsPage
							organizationId={organizationId}
							activeHostUrl={activeHostUrl}
						/>
					)}
					{page === "workspaces" && activeHostUrl && (
						<ImportWorkspacesPage
							organizationId={organizationId}
							activeHostUrl={activeHostUrl}
						/>
					)}
					{page === "presets" && (
						<ImportPresetsPage organizationId={organizationId} />
					)}
				</div>

				<div className="box-border flex items-center justify-between border-t bg-background px-5 py-4">
					{previousPage ? (
						<Button variant="outline" onClick={() => setPage(previousPage)}>
							Back
						</Button>
					) : (
						<div />
					)}
					{nextPage ? (
						<Button onClick={() => setPage(nextPage)}>
							{page === "welcome" ? "Get started" : "Next"}
						</Button>
					) : (
						<Button onClick={close}>Done</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
