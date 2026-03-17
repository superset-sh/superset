type CreateShortcutKeyboardEvent = {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	preventDefault: () => void;
};

export function handleCreateShortcutKeyDown(
	event: CreateShortcutKeyboardEvent,
	onCreate: () => void,
) {
	if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) {
		return;
	}

	event.preventDefault();
	onCreate();
}
