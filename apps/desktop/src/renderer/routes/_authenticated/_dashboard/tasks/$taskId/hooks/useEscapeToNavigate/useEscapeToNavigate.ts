import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export function useEscapeToNavigate(
	to: string,
	options?: { search?: Record<string, unknown> },
) {
	const navigate = useNavigate();
	const search = options?.search;

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;

			// Don't handle if already handled (e.g., by a dropdown)
			if (event.defaultPrevented) return;

			const activeElement = document.activeElement;
			const isBody = !activeElement || activeElement === document.body;

			// Check if we're in an editable element
			const isInput =
				activeElement instanceof HTMLInputElement ||
				activeElement instanceof HTMLTextAreaElement;
			const isInContentEditable =
				activeElement?.closest("[contenteditable='true']") !== null;

			if (
				(isInput || isInContentEditable) &&
				activeElement instanceof HTMLElement
			) {
				activeElement.blur();
				event.preventDefault();
				return;
			}

			// Nothing focused, navigate back
			if (isBody) {
				navigate({ to, search });
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [navigate, to, search]);
}
