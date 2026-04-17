// ── Relay → Host ────────────────────────────────────────────────────

export interface TunnelHttpRequest {
	type: "http";
	id: string;
	method: string;
	path: string;
	headers: Record<string, string>;
	body?: string;
}

export interface TunnelWsOpen {
	type: "ws:open";
	id: string;
	path: string;
	query?: string;
}

export interface TunnelWsFrame {
	type: "ws:frame";
	id: string;
	data: string;
}

export interface TunnelWsClose {
	type: "ws:close";
	id: string;
	code?: number;
}

export interface TunnelPing {
	type: "ping";
}

export type TunnelRequest =
	| TunnelHttpRequest
	| TunnelWsOpen
	| TunnelWsFrame
	| TunnelWsClose
	| TunnelPing;

// ── Host → Relay ────────────────────────────────────────────────────

export interface TunnelHttpResponse {
	type: "http:response";
	id: string;
	status: number;
	headers: Record<string, string>;
	body?: string;
}

export interface TunnelPong {
	type: "pong";
}

export type TunnelResponse =
	| TunnelHttpResponse
	| TunnelWsFrame
	| TunnelWsClose
	| TunnelPong;
