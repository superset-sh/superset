import { useEffect, useState } from "react";
import type { IconType } from "react-icons";

type ProjectIcons = Record<string, IconType>;

let loaded: ProjectIcons | null = null;
let loading: Promise<ProjectIcons> | null = null;

function loadProjectIcons(): Promise<ProjectIcons> {
	loading ??= import("./icons").then((module) => {
		loaded = module.PROJECT_ICONS;
		return loaded;
	});
	return loading;
}

/** The project icon set, or null until its chunk has loaded. */
export function useProjectIcons(): ProjectIcons | null {
	const [icons, setIcons] = useState(loaded);
	useEffect(() => {
		if (icons) return;
		let cancelled = false;
		void loadProjectIcons().then((next) => {
			if (!cancelled) setIcons(next);
		});
		return () => {
			cancelled = true;
		};
	}, [icons]);
	return icons;
}
