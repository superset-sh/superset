import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { createContext } from "react";

export const FileMoveContext = createContext<
	((event: FsWatchEvent) => void) | null
>(null);
