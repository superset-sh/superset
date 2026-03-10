import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApp } from "../src/main";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  const instance = app.getHttpAdapter().getInstance();
  instance.server.emit("request", req, res);
}
