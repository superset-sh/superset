import { msg } from "@lingui/core/macro";
import { useLingui as useTranslation } from "@lingui/react";
import { errorMessage } from "@superset/i18n/errors";
import { useEffect, useState } from "react";
import { track } from "renderer/lib/analytics";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	attentionSignature,
	type V1AttentionItem,
} from "renderer/lib/v1-migration/attention";
import { dismissV1Attention } from "renderer/lib/v1-migration/completion";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import {
	isStatusCardVisible,
	useV1MigrationStatusStore,
} from "renderer/stores/v1-migration-status";
import { FlipNoticeCard } from "../components/FlipNoticeCard";
import { AttentionItemRow } from "./components/AttentionItemRow";

type WorktreeAttentionItem = Extract<V1AttentionItem, { kind: "worktree" }>;

const branchV1Worktree = (item: WorktreeAttentionItem) =>
	electronTrpcClient.migration.branchV1Worktree.mutate({
		path: item.path,
		branch: item.branch,
	});

export function V1MigrationStatusCard({
	organizationId,
	branchWorktree = branchV1Worktree,
}: {
	organizationId: string;
	branchWorktree?: (item: WorktreeAttentionItem) => Promise<unknown>;
}) {
	const { _: translate } = useTranslation();
	const status = useV1MigrationStatusStore((state) => state.status);
	const attentionItems = useV1MigrationStatusStore(
		(state) => state.attentionItems,
	);
	const visible = useV1MigrationStatusStore((state) =>
		isStatusCardVisible(state, organizationId),
	);
	const dismissCard = useV1MigrationStatusStore((state) => state.dismiss);
	const requestPass = useV1MigrationStatusStore((state) => state.requestPass);
	const openV1ImportModal = useOpenV1ImportModal();
	const [importing, setImporting] = useState<ReadonlySet<string>>(new Set());
	const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());

	useEffect(() => {
		if (visible) {
			track("v1_migration_status_shown", {
				status,
				item_count: attentionItems.length,
			});
		}
	}, [visible, status, attentionItems.length]);

	if (!visible) return null;

	const dismiss = () => {
		track("v1_migration_status_dismissed", { status });
		if (status === "attention") {
			dismissV1Attention(organizationId, attentionSignature(attentionItems));
		}
		dismissCard(organizationId);
	};
	const openImporter = () => {
		track("v1_migration_status_importer_opened", { status });
		dismissCard(organizationId);
		openV1ImportModal();
	};
	const branchOne = async (item: WorktreeAttentionItem): Promise<boolean> => {
		setImporting((prev) => new Set(prev).add(item.v1Id));
		setErrors((prev) => {
			const next = new Map(prev);
			next.delete(item.v1Id);
			return next;
		});
		try {
			await branchWorktree(item);
			return true;
		} catch (err) {
			setErrors((prev) => new Map(prev).set(item.v1Id, errorMessage(err)));
			return false;
		} finally {
			setImporting((prev) => {
				const next = new Set(prev);
				next.delete(item.v1Id);
				return next;
			});
		}
	};
	const importItem = async (item: V1AttentionItem) => {
		track("v1_migration_attention_import_clicked", { kind: item.kind });
		if (item.kind === "project") {
			openImporter();
			return;
		}
		if (await branchOne(item)) requestPass();
	};
	const worktreeItems = attentionItems.filter(
		(item): item is WorktreeAttentionItem => item.kind === "worktree",
	);
	const importAll = async () => {
		if (importing.size > 0) return;
		track("v1_migration_attention_import_all_clicked", {
			item_count: worktreeItems.length,
		});
		let imported = 0;
		for (const item of worktreeItems) {
			if (await branchOne(item)) imported++;
		}
		if (imported > 0) requestPass();
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
	const hasWorktrees = worktreeItems.length > 0;
	const canImportAll = worktreeItems.length > 1;

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
									"Import puts a worktree on a new branch at its current commit, so it can come over. Your files do not change.",
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
				canImportAll
					? translate(msg({ message: "Import all" }))
					: hasProjects
						? translate(msg({ message: "Open importer" }))
						: translate(msg({ message: "Got it" }))
			}
			onCta={
				canImportAll
					? () => {
							void importAll();
						}
					: hasProjects
						? openImporter
						: undefined
			}
			onDismiss={dismiss}
		>
			<ul className="max-h-48 space-y-1.5 overflow-y-auto">
				{attentionItems.map((item) => (
					<AttentionItemRow
						key={`${item.kind}:${item.v1Id}`}
						item={item}
						importing={importing.has(item.v1Id)}
						error={errors.get(item.v1Id) ?? null}
						onImport={() => {
							void importItem(item);
						}}
					/>
				))}
			</ul>
		</FlipNoticeCard>
	);
}
