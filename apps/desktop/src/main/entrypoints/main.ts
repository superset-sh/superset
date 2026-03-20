// Bootstrap entry for the main process. Ensures runtime patches run before application modules.
import "../patch-node-stream"; // apply polyfills early
import "../index"; // continue with normal app entry
