import {
	type AppCollections,
	ELECTRIC_WRITE_SYNC_TIMEOUT_MS,
} from "./collections";

export function waitForWorkspaceDeleted(
	collection: AppCollections["v2Workspaces"],
	workspaceId: string,
): Promise<void> {
	if (!collection.get(workspaceId)) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		let settled = false;
		const timeoutId = setTimeout(() => {
			if (settled) return;
			settled = true;
			subscription.unsubscribe();
			reject(
				new Error(
					`Workspace ${workspaceId} deletion did not sync to the local collection`,
				),
			);
		}, ELECTRIC_WRITE_SYNC_TIMEOUT_MS);

		const finish = () => {
			if (settled || collection.get(workspaceId)) return;
			settled = true;
			clearTimeout(timeoutId);
			subscription.unsubscribe();
			resolve();
		};

		const subscription = collection.subscribeChanges(finish, {
			includeInitialState: false,
		});
		finish();
	});
}
