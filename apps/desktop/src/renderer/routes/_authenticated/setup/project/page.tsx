import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LuFolder } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
import { MOCK_ORG_ID } from "shared/constants";
import { SetupButton } from "../components/SetupButton";
import { StepHeader, StepShell, SupersetPill } from "../components/StepShell";
import { SupersetIcon } from "../providers/components/SupersetIcon";

export const Route = createFileRoute("/_authenticated/setup/project/")({
	component: OnboardingProjectPage,
});

function OnboardingProjectPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const markComplete = useOnboardingStore((s) => s.markComplete);
	const markSkipped = useOnboardingStore((s) => s.markSkipped);

	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: projects = [], isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({
					id: projects.id,
					name: projects.name,
					repoCloneUrl: projects.repoCloneUrl,
				})),
		[collections, activeOrganizationId],
	);

	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const { activeHostUrl } = useLocalHostService();
	const hostReady = activeHostUrl !== null;

	useEffect(() => {
		goTo("project");
	}, [goTo]);

	const projectCount = projects.length;
	const hasProjects = projectCount > 0;

	const handleSelectNewRepo = async () => {
		const result = await folderImport.start();
		if (result) {
			markComplete("project");
		}
	};

	const handleContinueWithCurrent = () => {
		markComplete("project");
		navigate({ to: STEP_ROUTES["adopt-worktrees"] });
	};

	const handleSkipStep = () => {
		markSkipped("project");
		navigate({ to: STEP_ROUTES["adopt-worktrees"] });
	};

	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-[#151110]">
				<Spinner className="size-6 text-[#a8a5a3]" />
			</div>
		);
	}

	const supersetIcon = (
		<SupersetPill>
			<div className="flex size-[48px] items-center justify-center rounded-[12px] bg-[#151110]">
				<SupersetIcon className="w-8" />
			</div>
		</SupersetPill>
	);

	if (hasProjects) {
		return (
			<StepShell backTo={STEP_ROUTES.permissions}>
				<StepHeader
					icon={supersetIcon}
					title="Your projects"
					subtitle={`${projectCount} project${projectCount === 1 ? "" : "s"} attached. Continue or add another.`}
				/>

				<div className="overflow-hidden rounded-lg border border-[#2a2827] bg-[#201e1c]">
					<div className="max-h-[280px] divide-y divide-[#2a2827] overflow-y-auto">
						{projects.map((project) => (
							<div
								key={project.id}
								className="flex items-center gap-3 px-4 py-3"
							>
								<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#151110] text-[#a8a5a3]">
									<LuFolder className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[12px] font-medium text-[#eae8e6]">
										{project.name}
									</p>
									{project.repoCloneUrl && (
										<p className="truncate font-mono text-[10px] text-[#a8a5a3]">
											{project.repoCloneUrl}
										</p>
									)}
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="flex w-[273px] flex-col gap-2 self-center">
					<SetupButton onClick={handleContinueWithCurrent}>
						Continue with current
					</SetupButton>
					<SetupButton
						variant="secondary"
						onClick={handleSelectNewRepo}
						disabled={!hostReady}
					>
						{hostReady ? "Select new repo" : "Connecting…"}
					</SetupButton>
					<SetupButton variant="link" onClick={handleSkipStep}>
						Skip for now
					</SetupButton>
				</div>
			</StepShell>
		);
	}

	return (
		<StepShell backTo={STEP_ROUTES.permissions}>
			<StepHeader
				icon={supersetIcon}
				title="Select a repository"
				subtitle="Choose a local folder to start working with"
			/>

			<div className="flex w-[273px] flex-col gap-2 self-center">
				<SetupButton onClick={handleSelectNewRepo} disabled={!hostReady}>
					{hostReady ? "Select new repo" : "Connecting…"}
				</SetupButton>
				<SetupButton variant="link" onClick={handleSkipStep}>
					Skip for now
				</SetupButton>
			</div>
		</StepShell>
	);
}
