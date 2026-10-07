import { msg } from "@lingui/core/macro";
import { useLingui as useTranslation } from "@lingui/react";
import { useEffect, useState } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { attentionSignature } from "renderer/lib/v1-migration/attention";
import {
	dismissV1Attention,
	isV1AttentionDismissed,
} from "renderer/lib/v1-migration/completion";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import { useV1MigrationStatusStore } from "renderer/stores/v1-migration-status";
import { FlipNoticeCard } from "../components/FlipNoticeCard";

const MAX_LISTED_ITEMS = 4;

export function V1MigrationStatusCard() {
	const { _: translate } = useTranslation();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;
	const { organizationId, status, attentionItems } =
		useV1MigrationStatusStore();
	const openV1ImportModal = useOpenV1ImportModal();
	const [dismissedStatus, setDismissedStatus] = useState<string | null>(null);

	const signature = attentionSignature(attentionItems);
	const visible =
		status !== "idle" &&
		!!organizationId &&
		organizationId === activeOrganizationId &&
		dismissedStatus !== status &&
		!(
			status === "attention" &&
			isV1AttentionDismissed(organizationId, signature)
		);

	useEffect(() => {
		if (visible) {
			track("v1_migration_status_shown", {
				status,
				item_count: attentionItems.length,
			});
		}
	}, [visible, status, attentionItems.length]);

	if (!visible || !organizationId) return null;

	const dismiss = () => {
		track("v1_migration_status_dismissed", { status });
		if (status === "attention") dismissV1Attention(organizationId, signature);
		setDismissedStatus(status);
	};
	const openImporter = () => {
		track("v1_migration_status_importer_opened", { status });
		setDismissedStatus(status);
		openV1ImportModal();
	};

	if (status === "running") {
		return (
			<FlipNoticeCard
				title={translate(msg({ message: "Bringing over your v1 projects" }))}
				body={translate(
					msg({
						message:
							"Your v1 projects and workspaces are moving to the new Superset. They appear in the sidebar as each one is ready.",
					}),
				)}
				ctaLabel={translate(msg({ message: "Hide" }))}
				onDismiss={dismiss}
			/>
		);
	}

	if (status === "blocked") {
		return (
			<FlipNoticeCard
				title={translate(msg({ message: "Some v1 items did not come over" }))}
				body={translate(
					msg({
						message:
							"Superset could not bring over some of your v1 projects or workspaces. Open the importer to see why and retry each one.",
					}),
				)}
				ctaLabel={translate(msg({ message: "Open importer" }))}
				onCta={openImporter}
				onDismiss={dismiss}
			/>
		);
	}

	const hasProjects = attentionItems.some((item) => item.kind === "project");
	const hasWorktrees = attentionItems.some((item) => item.kind === "worktree");
	const hiddenCount = attentionItems.length - MAX_LISTED_ITEMS;

	return (
		<FlipNoticeCard
			title={translate(msg({ message: "Some v1 work needs your attention" }))}
			body={[
				translate(
					msg({
						message:
							"These folders still have your files, but they did not come over to the new Superset on their own.",
					}),
				),
				hasWorktrees
					? translate(
							msg({
								message:
									"For a worktree, check out a branch in its folder and it comes over on the next launch. If you moved it, right-click its project and choose Import untracked worktrees.",
							}),
						)
					: null,
				hasProjects
					? translate(
							msg({
								message: "For a project, open the importer to link it.",
							}),
						)
					: null,
			]
				.filter(Boolean)
				.join(" ")}
			ctaLabel={
				hasProjects
					? translate(msg({ message: "Open importer" }))
					: translate(msg({ message: "Got it" }))
			}
			onCta={hasProjects ? openImporter : undefined}
			onDismiss={dismiss}
		>
			<ul className="space-y-1.5">
				{attentionItems.slice(0, MAX_LISTED_ITEMS).map((item) => (
					<li key={`${item.kind}:${item.v1Id}`} className="min-w-0">
						<p className="truncate text-sm">{item.name}</p>
						<p className="truncate font-mono text-muted-foreground text-xs">
							{item.path}
						</p>
					</li>
				))}
				{hiddenCount > 0 ? (
					<li className="text-muted-foreground text-xs">
						{translate(
							msg({ message: `and ${hiddenCount} more`, context: "list" }),
						)}
					</li>
				) : null}
			</ul>
		</FlipNoticeCard>
	);
}
