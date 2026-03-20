// Patch for environments where stream.getDefaultHighWaterMark is unavailable
// This file is intentionally small and safe for development only.
try {
  const node_stream = require('stream');
  if (typeof node_stream.getDefaultHighWaterMark !== 'function') {
    node_stream.getDefaultHighWaterMark = function (isObjectMode) {
      // Object-mode default in Node is typically 16; buffer-mode typical default is 16KB
      return isObjectMode ? 16 : 16 * 1024;
    };
    // eslint-disable-next-line no-console
    console.log('[patch-node-stream] polyfilled stream.getDefaultHighWaterMark');
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[patch-node-stream] failed to apply patch', err && err.message);
}
