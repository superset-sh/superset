import { useCallback, useEffect, useState } from "react";

export function useRightPaneAreaFullScreen({
	workspaceId,
	isOpen,
}: {
	workspaceId: string;
	isOpen: boolean;
}): { isFullScreen: boolean; toggle: () => void } {
	const [fullScreenWorkspaceId, setFullScreenWorkspaceId] = useState<
		string | null
	>(null);
	const isFullScreen = fullScreenWorkspaceId === workspaceId;

	useEffect(() => {
		if (!isOpen) {
			setFullScreenWorkspaceId((current) =>
				current === workspaceId ? null : current,
			);
		}
	}, [isOpen, workspaceId]);

	const toggle = useCallback(() => {
		setFullScreenWorkspaceId((current) =>
			current === workspaceId ? null : workspaceId,
		);
	}, [workspaceId]);

	return { isFullScreen, toggle };
}
