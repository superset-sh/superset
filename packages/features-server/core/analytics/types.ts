export interface ServerErrorEvent {
  path: string;
  method: string;
  statusCode: number;
  errorMessage: string;
  errorCode?: string;
  requestId?: string | number;
  userId?: string;
  stack?: string;
}

export interface PostHogConfig {
  apiKey: string;
  host: string;
}
