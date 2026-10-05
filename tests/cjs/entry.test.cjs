/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /tests/cjs/entry.test.cjs
 *	@Date: 2026-10-03T10:28:33-07:00 (1791048513)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-03T10:29:28-07:00 (1791048568)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * CommonJS entry tests. These run under Node's own test runner (`node --test`), not Vitest:
 * Vitest loads files through its own module runner, so it cannot show whether a plain
 * `require()` of the built package works the way it does for a CommonJS consumer.
 * They test the built dist/ output, so `npm run test:cjs` builds first.
 */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

/**
 * Assert that a require() result exposes exactly the ESM module's exports. Node's require(esm)
 * returns the namespace itself, or - for a module with a default export - an object carrying
 * the same bindings plus `__esModule: true` for bundler interop, so compare member by member.
 * @param {object} required - What require() returned.
 * @param {object} esm - The namespace import() returned.
 */
function assertSameExports(required, esm) {
	assert.ok(Object.keys(esm).length > 0);
	for (const key of Object.keys(esm)) {
		assert.equal(required[key], esm[key], `export "${key}" differs`);
	}
	const extra = Object.keys(required).filter((key) => !(key in esm));
	assert.deepEqual(
		extra.filter((key) => key !== "__esModule"),
		[]
	);
}

test("require() of the CJS entry returns the same namespace as import", async () => {
	const required = require("../../dist/cjs/index.cjs");
	const esm = await import("../../dist/index.mjs");

	assert.equal(typeof required.then, "undefined", "require() must not return a Promise");
	assertSameExports(required, esm);
	assert.deepEqual(required.parse('{"a":1}'), { a: 1 });
});

test("require() of a year wrapper returns the same namespace as import", async () => {
	const required = require("../../dist/cjs/years/2021.cjs");
	const esm = await import("../../dist/years/2021.mjs");

	assert.equal(typeof required.then, "undefined", "require() must not return a Promise");
	assertSameExports(required, esm);
	assert.deepEqual(required.parse("{ value: 1_000 }"), { value: 1000 });
});

test("require() fails with a clear message where Node.js has no require(esm)", () => {
	// --no-experimental-require-module turns require(esm) off, which is what Node.js
	// versions before 20.19 / 22.12 look like to the entry.
	const res = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", "require('./dist/cjs/index.cjs')"], {
		cwd: repoRoot,
		encoding: "utf8"
	});

	assert.notEqual(res.status, 0);
	assert.match(res.stderr, /ERR_REQUIRE_ESM/);
	assert.match(res.stderr, /require\(\) needs Node\.js \^20\.19\.0 or >=22\.12\.0/);
	assert.match(res.stderr, /import\(\)/);
});
