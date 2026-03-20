// Development-time patch to polyfill stream.getDefaultHighWaterMark when missing.
// This ensures compatibility across Electron/Node versions during local dev only.
try {
  // Use require to get the Node stream module reliably at runtime
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const node_stream = require('stream');
  if (typeof node_stream.getDefaultHighWaterMark !== 'function') {
    (node_stream as any).getDefaultHighWaterMark = function (isObjectMode: boolean) {
      return isObjectMode ? 16 : 16 * 1024;
    };
    // eslint-disable-next-line no-console
    console.log('[patch-node-stream] polyfilled stream.getDefaultHighWaterMark');
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[patch-node-stream] failed to apply patch', err && (err as Error).message);
}
