import { canBindPort } from "../host-service-utils";
import { portManager } from "../terminal/port-manager";
import { PortForwardManager } from "./port-forward-manager";
import { RelayForwardTransport } from "./relay-forward-transport";

let relayToken: string | null = null;

export function setRelayToken(token: string | null): void {
	relayToken = token;
}

export const portForwardManager = new PortForwardManager({
	transport: new RelayForwardTransport({ getToken: () => relayToken }),
	getLocalPorts: () => portManager.getAllPorts(),
	killLocalPort: ({ terminalId, workspaceId, port }) =>
		portManager.killPort({ terminalId, workspaceId, port }),
	canBindPort,
});
