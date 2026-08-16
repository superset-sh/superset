// esbuild alias target for `react` in plugin app bundles: the host renderer
// sets this global before importing a plugin module, so plugin components
// share the host's React instance (hooks require exactly one React).
module.exports = globalThis.__SUPERSET_PLUGIN_HOST__.React;
