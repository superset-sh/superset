import type {
	SidebarStateDocument,
	SidebarStateScope,
} from "@superset/client-state";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	applySidebarStateSnapshot,
	getSidebarStateSnapshot,
} from "./applySidebarStateSnapshot";

interface SidebarStateControllerProps {
	organizationId: string;
	userId: string;
}

function stateSignature(document: Pick<SidebarStateDocument, "state">): string {
	return JSON.stringify(document.state);
}

export function SidebarStateController({
	organizationId,
	userId,
}: SidebarStateControllerProps): null {
	const collections = useCollections();
	const scope = useMemo<SidebarStateScope>(
		() => ({ organizationId, userId }),
		[organizationId, userId],
	);
	const readyRef = useRef(false);
	const revisionRef = useRef(0);
	const persistedSignatureRef = useRef("");

	const { data: projectRows = [] } = useLiveQuery(
		(query) => query.from({ projects: collections.v2SidebarProjects }),
		[collections],
	);
	const { data: groupRows = [] } = useLiveQuery(
		(query) => query.from({ groups: collections.v2SidebarSections }),
		[collections],
	);
	const { data: workspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ workspaces: collections.v2WorkspaceLocalState })
				.select(({ workspaces }) => ({
					workspaceId: workspaces.workspaceId,
					sidebarState: workspaces.sidebarState,
				})),
		[collections],
	);
	const localCollectionRevision = useMemo(
		() => JSON.stringify([projectRows, groupRows, workspaceRows]),
		[groupRows, projectRows, workspaceRows],
	);

	const acceptDocument = useCallback(
		(document: SidebarStateDocument) => {
			persistedSignatureRef.current = stateSignature(document);
			revisionRef.current = document.revision;
			applySidebarStateSnapshot(collections, document.state);
			readyRef.current = true;
		},
		[collections],
	);

	useEffect(() => {
		let cancelled = false;
		readyRef.current = false;
		void electronTrpcClient.sidebarState.get
			.query(scope)
			.then(async (result) => {
				if (cancelled) return;
				if (result.document.rendererMigrated) {
					acceptDocument(result.document);
					return;
				}
				const initialized =
					await electronTrpcClient.sidebarState.initialize.mutate({
						scope,
						state: getSidebarStateSnapshot(collections),
					});
				if (!cancelled) acceptDocument(initialized.document);
			})
			.catch((error) => {
				if (!cancelled) {
					console.error("[sidebar-state] Failed to initialize", error);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [acceptDocument, collections, scope]);

	electronTrpc.sidebarState.onChanged.useSubscription(scope, {
		onData: (result) => acceptDocument(result.document),
	});

	useEffect(() => {
		if (!readyRef.current || !localCollectionRevision) return;
		const state = getSidebarStateSnapshot(collections);
		const signature = JSON.stringify(state);
		if (signature === persistedSignatureRef.current) return;

		const timer = window.setTimeout(() => {
			void electronTrpcClient.sidebarState.replace
				.mutate({
					scope,
					state,
					expectedRevision: revisionRef.current,
				})
				.then((result) => acceptDocument(result.document))
				.catch((error) => {
					console.error(
						"[sidebar-state] Failed to persist local changes",
						error,
					);
				});
		}, 50);
		return () => window.clearTimeout(timer);
	}, [acceptDocument, collections, localCollectionRevision, scope]);

	return null;
}
