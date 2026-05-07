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
import { IntroPage } from "./components/IntroPage";
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
				className="flex flex-col w-[min(744px,calc(100vw-2rem))] !max-w-[744px] h-[min(540px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] p-0 gap-0 overflow-hidden !rounded-none [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5 [&>[data-slot=dialog-close]]:z-10 [&>[data-slot=dialog-close]]:opacity-100 [&>[data-slot=dialog-close]]:text-muted-foreground hover:[&>[data-slot=dialog-close]]:text-foreground"
				onEscapeKeyDown={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogTitle className="sr-only">
					{page === "welcome"
						? "Welcome to Superset v2"
						: page === "intro"
							? "Let's get you started"
							: "Import from v1"}
				</DialogTitle>
				<DialogDescription className="sr-only">
					Let's get your workspaces and projects ported over. Terminal sessions
					won't be carried over, but you can still access v1 at any time.
				</DialogDescription>

				<div
					key={page}
					className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden animate-in fade-in duration-200"
				>
					{page === "welcome" && <WelcomePage />}
					{page === "intro" && <IntroPage />}
					{(page === "projects" || page === "workspaces") && !activeHostUrl && (
						<div className="flex flex-1 items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
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

				<div className="box-border flex shrink-0 items-center justify-between gap-3 border-t bg-background px-5 py-4">
					{previousPage ? (
						<Button
							variant="outline"
							onClick={() => setPage(previousPage)}
							className="shrink-0"
						>
							Back
						</Button>
					) : (
						<div />
					)}
					{nextPage ? (
						<Button onClick={() => setPage(nextPage)} className="shrink-0">
							{page === "welcome" ? "Get started" : "Next"}
						</Button>
					) : (
						<Button onClick={close} className="shrink-0">
							Done
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
