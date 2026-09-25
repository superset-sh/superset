import { AgentOptionsScreen } from "@/screens/(authenticated)/components/AgentOptionsScreen";

export default function NewSessionModelRoute() {
	return (
		<AgentOptionsScreen
			groupHref={(params) => ({
				pathname: "/(authenticated)/(home)/new-session/model-group",
				params,
			})}
		/>
	);
}
