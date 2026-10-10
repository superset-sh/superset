import { useEffect } from "react";

function isTyping(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
		target.closest("[role=listbox],[role=menu],[role=dialog]") !== null
	);
}

export function useListKeys(onPrev?: () => void, onNext?: () => void) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTyping(event.target)) return;
			if ((event.key === "k" || event.key === "ArrowUp") && onPrev) {
				event.preventDefault();
				onPrev();
			} else if ((event.key === "j" || event.key === "ArrowDown") && onNext) {
				event.preventDefault();
				onNext();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onPrev, onNext]);
}
