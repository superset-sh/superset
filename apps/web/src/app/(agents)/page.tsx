import { PageContainer } from "@/components/PageContainer";
import { DownloadSuperset } from "./components/DownloadSuperset";
import { getAgentsUiAccess } from "./utils/getAgentsUiAccess";

export default async function HomePage() {
	await getAgentsUiAccess();

	return (
		<PageContainer>
			<DownloadSuperset />
		</PageContainer>
	);
}
