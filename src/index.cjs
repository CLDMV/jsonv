/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /src/index.cjs
 *	@Date: 2026-11-01T12:09:23-08:00 (1793563763)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T16:28:09-08:00 (1793579289)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * CommonJS entry point: the generic CLDMV shim over the ESM build.
 *
 * `require("@cldmv/jsonv")` returns what `import` sees. The package exports several distinct values, so the
 * shim hands back the module object (`{ parse, stringify, ... }`) with every export on it.
 *
 * tsup.config.mjs copies this file verbatim to dist/index.cjs, where `require("./index.mjs")` resolves to the
 * built ESM entry. The source is TypeScript, so src/ has no index.mjs beside it: in a checkout, `require()`
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

// Same exports as `import`. One distinct exported value (aliases of it count once) comes back as that value,
// so require(x)(...) works; anything else comes back as the module object ({ default, ...named }).
const esm = require("./index.mjs");
const values = new Set(
	Object.keys(esm)
		.filter((key) => key !== "__esModule")
		.map((key) => esm[key])
);
module.exports = values.size === 1 ? values.values().next().value : esm;
