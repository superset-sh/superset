import { WebClient } from "@slack/web-api";

export function createSlackClient(token: string): WebClient {
	return new WebClient(token);
}
