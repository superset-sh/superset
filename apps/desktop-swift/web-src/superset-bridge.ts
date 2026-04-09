// Frame types (must match Swift OutputBatcher constants)
const FRAME_DATA = 0x01;
const FRAME_EXIT = 0x02;
const FRAME_ERROR = 0x03;

// --- Control Plane (WKScriptMessageHandler) ---

export function postControlMessage(msg: Record<string, unknown>): void {
  (window as any).webkit.messageHandlers.superset.postMessage(msg);
}

export function requestCreateSession(sessionId: string, cwd: string): void {
  postControlMessage({ action: "createSession", sessionId, cwd });
}

export function requestDestroySession(sessionId: string): void {
  postControlMessage({ action: "destroySession", sessionId });
}

export function requestResize(sessionId: string, cols: number, rows: number): void {
  postControlMessage({ action: "resize", sessionId, cols, rows });
}

export function signalReady(): void {
  postControlMessage({ action: "ready" });
}

// --- Data Plane (WKURLSchemeHandler) ---

export async function sendInput(sessionId: string, data: string): Promise<void> {
  const encoded = new TextEncoder().encode(data);
  await fetch(`superset://terminal/input/${sessionId}`, {
    method: "POST",
    body: encoded,
  });
}

function concat(a: Uint8Array<ArrayBuffer>, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export interface StreamCallbacks {
  onData: (data: Uint8Array) => void;
  onExit: (code: number, signal: number) => void;
  onError: (message: string) => void;
}

export async function connectOutputStream(
  sessionId: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const response = await fetch(`superset://terminal/stream/${sessionId}`);

  if (!response.ok || !response.body) {
    callbacks.onError(`Stream connection failed: ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  let buf: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf = concat(buf, value);

    // Parse frames from buffer
    while (buf.length >= 5) {
      const type = buf[0];
      const len =
        (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4];

      if (buf.length < 5 + len) break; // incomplete frame

      const payload = buf.slice(5, 5 + len);
      buf = buf.slice(5 + len);

      switch (type) {
        case FRAME_DATA:
          callbacks.onData(payload);
          break;

        case FRAME_EXIT: {
          const json = JSON.parse(new TextDecoder().decode(payload));
          callbacks.onExit(json.code, json.signal);
          return;
        }

        case FRAME_ERROR: {
          const message = new TextDecoder().decode(payload);
          callbacks.onError(message);
          return;
        }

        default:
          console.warn("Unknown frame type:", type);
      }
    }
  }
}
