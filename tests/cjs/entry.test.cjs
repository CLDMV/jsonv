/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /tests/cjs/entry.test.cjs
 *	@Date: 2026-10-03T10:28:33-07:00 (1791048513)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T13:17:17-08:00 (1793567837)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * CommonJS entry tests. These run under Node's own test runner (`node --test`), not Vitest:
 * Vitest loads files through its own module runner, so it cannot show whether a plain
 * `require()` of the built package works the way it does for a CommonJS consumer.
 * They test the built dist/ output, so `npm run test:cjs` builds first.
 *
 * The `jsonv-dev` condition maps only `import` to src/ (the source is TypeScript, so there is no
 * src/index.mjs for a CommonJS wrapper to load); `require()` in a checkout always gets dist/.
 */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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
	const required = require("../../dist/index.cjs");
	const esm = await import("../../dist/index.mjs");

	assert.equal(typeof required.then, "undefined", "require() must not return a Promise");
	assertSameExports(required, esm);
	assert.deepEqual(required.parse('{"a":1}'), { a: 1 });
});

test("require() of a year wrapper returns the same namespace as import", async () => {
	const required = require("../../dist/years/2021.cjs");
	const esm = await import("../../dist/years/2021.mjs");

	assert.equal(typeof required.then, "undefined", "require() must not return a Promise");
	assertSameExports(required, esm);
	assert.deepEqual(required.parse("{ value: 1_000 }"), { value: 1000 });
});

test("require() fails with a clear message where Node.js has no require(esm)", () => {
	// --no-experimental-require-module turns require(esm) off, which is what Node.js
	// versions before 20.19 / 22.12 look like to the entry.
	const res = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", "require('./dist/index.cjs')"], {
		cwd: repoRoot,
		encoding: "utf8"
	});

	assert.notEqual(res.status, 0);
	assert.match(res.stderr, /ERR_REQUIRE_ESM/);
	assert.match(res.stderr, /require\(\) needs Node\.js >=22\.22\.0/);
	assert.match(res.stderr, /import\(\)/);
});

test("dist/index.cjs is a verbatim copy of src/index.cjs", () => {
	assert.equal(
		fs.readFileSync(path.join(repoRoot, "dist/index.cjs"), "utf8"),
		fs.readFileSync(path.join(repoRoot, "src/index.cjs"), "utf8")
	);
});

test("every CJS wrapper sits beside its ESM file, with no dist/cjs/ tree", () => {
	assert.equal(fs.existsSync(path.join(repoRoot, "dist/cjs")), false);
	assert.equal(fs.existsSync(path.join(repoRoot, "dist/types/cjs")), false);
	const years = path.join(repoRoot, "dist/years");
	const esm = fs.readdirSync(years).filter((f) => f.endsWith(".mjs"));
	assert.ok(esm.includes("2021.mjs") && esm.includes("2025.mjs") && esm.includes("loader.mjs"));
	for (const file of esm) {
		assert.ok(fs.existsSync(path.join(years, file.replace(/\.mjs$/, ".cjs"))), `${file} has no .cjs wrapper`);
	}
});

test("require() by package name resolves to dist/ with and without the jsonv-dev condition", () => {
	const script = `
		const root = require("@cldmv/jsonv");
		const y2023 = require("@cldmv/jsonv/2023");
		const resolver = require("@cldmv/jsonv/year-resolver");
		console.log(JSON.stringify({
			root: require.resolve("@cldmv/jsonv"),
			year: require.resolve("@cldmv/jsonv/2023"),
			parsed: root.parse("{ a: 1 }"),
			bigint: typeof y2023.parse("{ v: 1n }").v,
			resolved: resolver.resolveYear(2023)
		}));
	`;
	for (const args of [[], ["--conditions=jsonv-dev"]]) {
		const res = spawnSync(process.execPath, [...args, "-e", script], { cwd: repoRoot, encoding: "utf8" });
		assert.equal(res.status, 0, res.stderr);
		const out = JSON.parse(res.stdout);
		assert.equal(out.root, path.join(repoRoot, "dist/index.cjs"));
		assert.equal(out.year, path.join(repoRoot, "dist/years/2023.cjs"));
		assert.deepEqual(out.parsed, { a: 1 });
		assert.equal(out.bigint, "bigint");
		assert.equal(out.resolved, 2021);
	}
});
