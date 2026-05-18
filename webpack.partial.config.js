/**
 * Webpack config fragment merged into `jupyter labextension build` via
 * `jupyterlab.webpackConfig` in package.json.
 *
 * Silences the noisy "Failed to parse source map" / "Invalid dependencies"
 * warnings emitted by source-map-loader when sql-formatter's ESM bundle
 * points at unshipped `src/*.ts` files. Runtime is unaffected.
 */
module.exports = {
  ignoreWarnings: [
    {
      module: /sql-formatter[\\/]dist[\\/]esm/
    }
  ]
};
