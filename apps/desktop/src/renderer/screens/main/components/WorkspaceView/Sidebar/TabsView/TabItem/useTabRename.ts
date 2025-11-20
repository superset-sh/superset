import { useEffect, useRef, useState } from "react";
import { useRenameTab } from "renderer/stores";

export function useTabRename(tabId: string, tabTitle: string) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(tabTitle);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const renameTab = useRenameTab();

	// Select input text when rename mode is activated
	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.select();
		}
	}, [isRenaming]);

	// Sync rename value when tab title changes
	useEffect(() => {
		setRenameValue(tabTitle);
	}, [tabTitle]);

	const startRename = () => {
		setIsRenaming(true);
	};

	const submitRename = () => {
		const trimmedValue = renameValue.trim();
		if (trimmedValue && trimmedValue !== tabTitle) {
			renameTab(tabId, trimmedValue);
		} else {
			setRenameValue(tabTitle);
		}
		setIsRenaming(false);
	};

	const cancelRename = () => {
		setRenameValue(tabTitle);
		setIsRenaming(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			cancelRename();
		}
	};

	return {
		isRenaming,
		renameValue,
		inputRef,
		setRenameValue,
		startRename,
		submitRename,
		cancelRename,
		handleKeyDown,
	};
}
