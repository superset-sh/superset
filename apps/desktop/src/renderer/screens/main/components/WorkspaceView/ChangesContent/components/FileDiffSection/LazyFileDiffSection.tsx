import { useEffect, useRef, useState } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { FileDiffSection } from "./FileDiffSection";

interface LazyFileDiffSectionProps {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash?: string;
	worktreePath: string;
	baseBranch?: string;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	isActioning?: boolean;
}

const PLACEHOLDER_HEIGHT = 52;
const ROOT_MARGIN = "200px 0px";

export function LazyFileDiffSection(props: LazyFileDiffSectionProps) {
	const [isVisible, setIsVisible] = useState(false);
	const placeholderRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const element = placeholderRef.current;
		if (!element || isVisible) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: ROOT_MARGIN },
		);

		observer.observe(element);
		return () => observer.disconnect();
	}, [isVisible]);

	if (!isVisible) {
		return (
			<div
				ref={placeholderRef}
				className="mx-2 my-2"
				style={{ height: PLACEHOLDER_HEIGHT }}
			/>
		);
	}

	return <FileDiffSection {...props} />;
}
