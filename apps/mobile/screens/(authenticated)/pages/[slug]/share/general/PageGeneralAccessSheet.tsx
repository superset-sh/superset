import { useLocalSearchParams } from "expo-router";
import { ShareGeneralAccessSheet } from "@/screens/(authenticated)/components/ShareAccess";
import { usePageGeneralAccess } from "../hooks/usePageGeneralAccess";
import { usePageShareRoles } from "../hooks/usePageShareRoles";

export function PageGeneralAccessSheet() {
	const { slug, mode } = useLocalSearchParams<{
		slug: string;
		mode: "who" | "level";
	}>();
	return (
		<ShareGeneralAccessSheet
			mode={mode === "level" ? "level" : "who"}
			general={usePageGeneralAccess(slug)}
			roles={usePageShareRoles()}
		/>
	);
}
