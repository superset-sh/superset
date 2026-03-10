/**
 * 환경변수 로드 — 반드시 다른 모듈보다 먼저 import해야 함
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ESM/CJS 모두 호환
const currentDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(currentDir, "../../../.env.local") });
