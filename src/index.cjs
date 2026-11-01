/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /src/index.cjs
 *	@Date: 2026-11-01T12:09:23-08:00 (1793563763)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T12:12:50-08:00 (1793563970)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * CommonJS entry point: a thin, synchronous re-export of the ESM build.
 *
 * Node's `require()` can load an ES module synchronously and get back its
 * exports directly as long as the module graph doesn't use top-level await,
 * so this file re-exports dist/index.mjs instead of a second, CommonJS copy
 * of the library.
 *
 * Node.js versions without require(esm) would fail with a bare
 * ERR_REQUIRE_ESM, so the check below fails early with a message that says
 * what to do instead.
 *
 * tsup.config.mjs copies this file verbatim to dist/index.cjs, where
 * `require("./index.mjs")` resolves to the built ESM entry. The source is
 * TypeScript, so src/ has no index.mjs beside it: in a checkout, `require()`
 * always loads the build (the `jsonv-dev` condition only maps `import`).
 *
 * @module @cldmv/jsonv
 */
"use strict";

if (!process.features?.require_module) {
	const error = new Error(
		`@cldmv/jsonv: require() needs Node.js ^20.19.0 or >=22.13.0 (this is ${process.version}). On older Node.js, load the package with import() instead.`
	);
	error.code = "ERR_REQUIRE_ESM";
	throw error;
}

module.exports = require("./index.mjs");
