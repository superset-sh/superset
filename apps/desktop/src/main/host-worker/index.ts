// Desktop bundle entry for the host-service worker thread. Emitted as
// dist/main/host-worker.js, side-by-side with host-service.js so the pool's
// script resolution finds it (see host-worker-pool.ts).
import "@superset/host-service/host-worker";
