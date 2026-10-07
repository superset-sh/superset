import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { ColorSelector } from "renderer/components/ColorSelector";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

interface ProjectColorFieldProps {
	projectId: string;
	hostUrl: string | null;
	color: string | null;
}

export function ProjectColorField({
	projectId,
	hostUrl,
	color,
}: ProjectColorFieldProps) {
	const { t } = useLingui();
	const [isPending, setIsPending] = useState(false);

	const handleSelectColor = async (value: string) => {
		if (!hostUrl) {
			toast.error(t({ message: "This project's host is offline" }));
			return;
		}
		setIsPending(true);
		try {
			await getHostServiceClientByUrl(hostUrl).project.setColor.mutate({
				projectId,
				color: value === PROJECT_COLOR_DEFAULT ? null : value,
			});
		} catch (err) {
			toast.error(errorMessage(err, t({ message: "Failed to set color" })));
		} finally {
			setIsPending(false);
		}
	};

	return (
		<ColorSelector
			includeDefault
			allowCustom
			selectedColor={color}
			disabled={isPending}
			onSelectColor={handleSelectColor}
		/>
	);
}
