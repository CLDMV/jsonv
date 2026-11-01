/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /tsup.config.mjs
 *	@Date: 2026-11-01T12:09:20-08:00 (1793563760)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T12:12:55-08:00 (1793563975)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Build config: produces the published dist/ output from src/.
 *
 *  - dist/** mirrors src/** file by file (no bundling, minified, names kept). Every year module is its own
 *    public subpath (`@cldmv/jsonv/2021`, `@cldmv/jsonv/loader`, ...) and `loadYear()` imports them at runtime,
 *    so the per-file layout must survive, and all entries share one copy of the parser and the error classes.
 *  - dist/index.cjs is the hand-written CJS entry src/index.cjs, copied verbatim by onSuccess below and never
 *    transformed by esbuild. It `require()`s ./index.mjs, which Node loads synchronously because the module
 *    graph has no top-level await.
 *
 * `npm run build` then emits the declarations (build:types) and the forwarding year modules plus their CJS
 * wrappers (generate:years). Sourcemaps are generated for local debugging but excluded from the published
 * tarball via package.json's `files` negation entry.
 */
import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/**/*.mts"],
	format: ["esm"],
	outDir: "dist",
	// jsonv also runs in browsers, so keep the syntax level the tsc build used.
	target: "es2022",
	platform: "neutral",
	bundle: false,
	splitting: false,
	sourcemap: true,
	dts: false,
	minify: true,
	keepNames: true,
	removeNodeProtocol: false,
	clean: true,
	outExtension() {
		return { js: ".mjs" };
	},
	onSuccess() {
		copyFileSync("src/index.cjs", "dist/index.cjs");
	}
});
