import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { getPluginIconUrl } from "renderer/components/PluginIcon";
import { FileIcon } from "renderer/lib/fileIcons";
import type { LinkUnfurl } from "../../../../utils/linkUnfurl";

const ICON_CLASSNAME =
	"mr-1 inline-block size-[1.05em] object-contain align-[-0.15em]";

export function LinkUnfurlIcon({ icon }: { icon: LinkUnfurl["icon"] }) {
	const isDark = useIsDarkTheme();
	if (icon.kind === "file") {
		return <FileIcon className={ICON_CLASSNAME} fileName={icon.fileName} />;
	}
	return (
		<img
			alt=""
			className={ICON_CLASSNAME}
			draggable={false}
			src={getPluginIconUrl(icon.name, isDark)}
		/>
	);
}
