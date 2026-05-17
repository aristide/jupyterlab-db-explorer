// Minimal ambient typing for the `vega-embed` ESM package.
//
// vega-embed exposes its types via the package.json `exports.types`
// condition, but the project's tsconfig still uses the classic
// `moduleResolution: "node"` (which ignores exports conditions). Rather
// than churn the module-resolution setting and risk breaking other
// imports, we declare the surface we actually use here.

declare module 'vega-embed' {
  export interface VisualizationSpec {
    [key: string]: unknown;
  }
  export interface Result {
    view: unknown;
    spec: VisualizationSpec;
    vgSpec: unknown;
    finalize: () => void;
  }
  export interface EmbedOptions {
    actions?: boolean | { [key: string]: boolean };
    renderer?: 'canvas' | 'svg';
    [key: string]: unknown;
  }
  export default function embed(
    el: HTMLElement | string,
    spec: VisualizationSpec | string,
    options?: EmbedOptions
  ): Promise<Result>;
}
