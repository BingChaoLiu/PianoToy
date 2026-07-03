// Ambient module declarations for the Verovio npm package. This file has no
// top-level imports/exports, so these `declare module` blocks are picked up
// globally. The package ships untyped .mjs bundles; we declare only the
// toolkit constructor surface (methods are typed at the call sites that use it
// — see verovio-engine.ts and musicxml-parser.ts).
// Reference: https://book.verovio.org/toolkit-reference/toolkit-methods.html

declare module "verovio/wasm" {
  /** Factory that boots the WASM module; resolves to the module object. */
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module "verovio/esm" {
  export class VerovioToolkit {
    constructor(module: unknown);
    loadData(data: string): boolean;
    renderToSVG(pageNo: number): string;
    renderToMIDI(): string;
    renderToTimemap(): unknown[];
    setOptions(options: Record<string, unknown>): void;
    getPageCount(): number;
  }
}
