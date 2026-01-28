import { Link } from "@tanstack/react-router";
import { HiArrowLeft, HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import {
	useSetSettingsSearchQuery,
	useSettingsSearchQuery,
} from "renderer/stores/settings-state";
import { getMatchCountBySection } from "../../utils/settings-search";
import { GeneralSettings } from "./GeneralSettings";
import { ProjectsSettings } from "./ProjectsSettings";

export function SettingsSidebar() {
	const searchQuery = useSettingsSearchQuery();
	const setSearchQuery = useSetSettingsSearchQuery();
	const matchCounts = searchQuery ? getMatchCountBySection(searchQuery) : null;

	return (
		<div className="w-56 flex flex-col p-3 overflow-hidden">
			{/* Back button */}
			<Link
				to="/workspace"
				className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
			>
				<HiArrowLeft className="h-4 w-4" />
				<span>Back</span>
			</Link>

			{/* Settings title */}
			<h1 className="text-lg font-semibold px-3 mb-4">Settings</h1>

			{/* Search input */}
			<div className="relative px-1 mb-4">
				<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
				<input
					type="text"
					placeholder="Search settings..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="w-full h-8 pl-8 pr-8 text-sm bg-accent/50 rounded-md border-0 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
				/>
				{searchQuery && (
					<button
						type="button"
						onClick={() => setSearchQuery("")}
						className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					>
						<HiXMark className="h-4 w-4" />
					</button>
				)}
			</div>

			<div className="flex-1 overflow-y-auto min-h-0">
				<GeneralSettings matchCounts={matchCounts} />
				<ProjectsSettings searchQuery={searchQuery} />
			</div>
		</div>
	);
}
