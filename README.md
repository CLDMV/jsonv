# @cldmv/jsonv

**@cldmv/jsonv** is a modern JSON parser and serializer that extends JSON5 with ES2015–2025 literals and year-pinned APIs. It is a **static data** format: JSON5 plus binary/octal literals, BigInt, numeric separators and template literals, with every feature gated by the ECMAScript year that introduced it.

On top of the literal syntax, jsonv adds **internal references** — file-scoped values that refer to other keys in the same document, forward references included — while forbidding executable syntax: no functions, classes, computed keys or shorthand properties. The parser is hand-written and has zero runtime dependencies.

> _JSON5 with modern literals and internal references, pinned to the ECMAScript year you choose._

[![npm version]][npm_version_url] [![npm downloads]][npm_downloads_url] [![GitHub downloads]][github_downloads_url] [![Last commit]][last_commit_url] [![npm last update]][npm_last_update_url] [![coverage]][coverage_url]

[![Contributors]][contributors_url] [![Sponsor shinrai]][sponsor_url]

---

## ✨ What's New

### Latest: v1.1.4 (October 2026)

- **`require()` returns the API synchronously** — `require("@cldmv/jsonv")` and `require("@cldmv/jsonv/<year>")` used to return a Promise of the ESM module; they now return the same exports as `import`, loaded through Node's `require(esm)`. Existing `await require(...)` code keeps working, but code that chained `.then()` on the `require()` result must use the result directly. CommonJS needs Node.js ^20.19.0 or >=22.12.0; older Node.js gets a clear `ERR_REQUIRE_ESM` pointing to `import()`. `@cldmv/jsonv/year-resolver` also gains the CommonJS wrapper it was missing (#80).
- [View full v1.1.4 Changelog](https://github.com/CLDMV/jsonv/blob/master/docs/changelog/v1/v1.1.4.md)

### Recent Releases

- **v1.1.3** (October 2026) — CI only: the in-repo PR mirror job runs instead of being skipped; `@cldmv/eslint-plugin-jsonv` dev bump ([Changelog](https://github.com/CLDMV/jsonv/blob/master/docs/changelog/v1/v1.1.3.md))
- **v1.1.2** (October 2026) — maintenance: uniform file headers, required-check mirror fix, `@types/node` bump; no runtime change ([Changelog](https://github.com/CLDMV/jsonv/blob/master/docs/changelog/v1/v1.1.2.md))
- **v1.1.1** (September 2026) — nine correctness fixes: `mode: "json"` / `"json5"` enforce their feature sets, tolerant mode reports collected syntax errors, forward-reference chains of any length resolve, and template tokens tile the source ([Changelog](https://github.com/CLDMV/jsonv/blob/master/docs/changelog/v1/v1.1.1.md))
- **v1.1.0** (September 2026) — `parseToAst()` returns comments and tokens with positioned keys and corrected spans; reference errors carry a position ([Changelog](https://github.com/CLDMV/jsonv/blob/master/docs/changelog/v1/v1.1.0.md))

📚 **For complete version history and detailed release notes, see the [docs/changelog/](https://github.com/CLDMV/jsonv/tree/master/docs/changelog/) folder.**

---

## 🚀 Key Features

- JSON5 superset (comments, trailing commas, single quotes, hex, etc.)
- Year‑pinned APIs: `@cldmv/jsonv/2011`, `/2015`, `/2020`, `/2021` (2022–2025 re‑export 2021)
- Modern literals: binary/octal, BigInt, numeric separators
- Internal references and template interpolation (ES2015+), including forward references
- Diagnostics: `diagnose()` and `info()` for year + feature detection
- Stringify with json/json5/jsonv modes, BigInt strategies, and raw JSON passthrough
- Dynamic year loading and resolver utilities (`loadYear`, `resolveYear`)
- Positioned AST, tokens and comments for tooling (`parseToAst()`)
- Zero dependencies, hand‑written parser

---

## 📦 Installation

### Requirements

- **Node.js 18 or higher** for ESM `import` (the package's `engines` floor).
- **`require()`** loads the ESM build through Node's `require(esm)`, so it needs **Node.js ^20.19.0 or >=22.12.0**. On older Node.js, load the package with `import()` instead.

### Install

```bash
npm install @cldmv/jsonv
```

---

## 🚀 Quick Start

```js
import { parse, stringify } from "@cldmv/jsonv";

const config = parse(`{
  port: 8080,
  host: "localhost",
  url: \`http://\${host}:\${port}\`,
  maxConnections: 1_000_000,
  bigValue: 9007199254740992n
}`);

const text = stringify(config);
```

CommonJS works the same way, synchronously:

```js
const { parse } = require("@cldmv/jsonv");

parse("{ a: 1 }"); // { a: 1 }
```

---

## 📅 Year‑Pinned API

Pin a year for stable grammar rules:

```js
import { parse } from "@cldmv/jsonv/2021"; // numeric separators + BigInt
import { parse as parse2015 } from "@cldmv/jsonv/2015"; // binary/octal + templates
import { parse as parse2011 } from "@cldmv/jsonv/2011"; // JSON5 base
```

See [docs/feature-matrix.md](https://github.com/CLDMV/jsonv/blob/master/docs/feature-matrix.md) and [docs/versioning-and-exports.md](https://github.com/CLDMV/jsonv/blob/master/docs/versioning-and-exports.md).

---

## 🔧 API Surface

Main entry: [src/index.mts](https://github.com/CLDMV/jsonv/blob/master/src/index.mts)

### Parse options (selected)

- `year`: 2011–2025 (defaults to latest)
- `mode`: `jsonv` (default) | `json5` (exactly JSON5 1.0) | `json` (exactly RFC 8259 JSON); see [Parse modes](#parse-modes)
- `allowInternalReferences`: default `true`
- `strictBigInt`: require `n` for unsafe integers (default `false`)
- `strictOctal`: require `0o` (reject legacy `0755`, default `false`)
- `tolerant`: collect every syntax error instead of stopping at the first; `parseWithOptions` then throws them together as one `JsonvAggregateSyntaxError` (see [Errors](#-errors))
- `preserveComments`: return comments (with positions) from `Parser#parse()`; see [AST for tooling](#-ast-for-tooling)

### Parse modes

`mode: "json"` accepts exactly RFC 8259 JSON and `mode: "json5"` accepts exactly JSON5 1.0; `mode: "jsonv"` (the default) enables every jsonv feature of the selected year. A feature outside the mode throws a positioned `JsonvSyntaxError` with `code: "FEATURE_NOT_ALLOWED_IN_MODE"` naming the feature and the mode, and an unknown `mode` value throws a `TypeError`. `parse()` takes the options object in place of the reviver:

```js
import { parse } from "@cldmv/jsonv";

parse('{"a": [1, 2]}', { mode: "json" }); // { a: [1, 2] }
parse("{ a: 1, }", { mode: "json" }); // throws: Unquoted keys not allowed in JSON mode at line 1, column 2
parse("{ a: 1, b: a }", { mode: "json5" }); // throws: Internal references not allowed in JSON5 mode at line 1, column 11
```

The full feature × mode table is in [docs/json5-compatibility.md](https://github.com/CLDMV/jsonv/blob/master/docs/json5-compatibility.md#compatibility-modes).

### Stringify options (selected)

- `mode`: `jsonv | json5 | json`
- `bigint`: `native | string | object`
- `singleQuote`, `trailingComma`, `unquotedKeys`
- `preserveNumericFormatting`

Full types: [src/api-types.mts](https://github.com/CLDMV/jsonv/blob/master/src/api-types.mts)

---

## 🛡 Errors

Parse failures throw `JsonvSyntaxError` (extends `SyntaxError`, `name` stays `"SyntaxError"`), with structured position info alongside the message:

```js
import { parse, JsonvSyntaxError } from "@cldmv/jsonv";

try {
	parse("{ a: 1, }");
} catch (err) {
	if (err instanceof JsonvSyntaxError) {
		console.log(err.line, err.column, err.offset); // 1-based line, message-matching column, 0-based offset
	}
}
```

This applies to every parse entry point (year-pinned APIs included) and every kind of positioned error — lexer-level (unterminated strings, invalid escapes, year-gated feature checks) and parser-level (unexpected tokens, strict-mode violations) alike.

With `tolerant: true`, the parser recovers at the next property or element boundary after a syntax error and keeps going. If any syntax error was collected, `parseWithOptions` (year-pinned APIs included) throws a single `JsonvAggregateSyntaxError` and does not evaluate the document. It is a `JsonvSyntaxError` whose own `line`/`column`/`offset`/`code` are the first error's, whose message is the first error's message followed by the total count, and whose `errors` array holds every error in source order, each a `JsonvSyntaxError` with its own position and code (the same error a strict parse would throw for it). A lexical error is reported through the same aggregate. Input without syntax errors evaluates exactly as it does without `tolerant`:

```js
import { parseWithOptions, JsonvAggregateSyntaxError } from "@cldmv/jsonv";

try {
	parseWithOptions("{ a: 1,, b: 2,, c: }", { tolerant: true });
} catch (err) {
	if (err instanceof JsonvAggregateSyntaxError) {
		err.message; // "Expected property key, got COMMA at line 1, column 7 (3 syntax errors in total)"
		err.errors.map((e) => [e.line, e.column, e.code]); // [[1, 7, "PARSE_ERROR"], [1, 14, "PARSE_ERROR"], [1, 19, "PARSE_ERROR"]]
	}
}
```

`parseToAst` never throws for collected errors; it returns them in `errors`.

Internal-reference resolution failures (an unresolved or circular internal reference) throw the sibling `JsonvReferenceError` (extends `ReferenceError`, `name` stays `"ReferenceError"`) instead, with the same structured `line`/`column`/`offset`/`code` shape, pointing at the offending reference:

```js
import { parseWithOptions, JsonvReferenceError } from "@cldmv/jsonv";

try {
	parseWithOptions("{ a: missing }");
} catch (err) {
	if (err instanceof JsonvReferenceError) {
		console.log(err.line, err.column, err.offset);
	}
}
```

---

## 🌳 AST for Tooling

`parseToAst()` returns the positioned AST without evaluating it, for linters, formatters and editors:

```js
import { parseToAst } from "@cldmv/jsonv"; // also exported from "@cldmv/jsonv/parser"

const { program, comments, tokens, errors } = parseToAst("// port\n{ port: 8080 }");
program.body.properties[0].key; // { type: "Identifier", name: "port", loc: { start: { line: 2, column: 2, offset: 10 }, ... } }
comments[0].value; // " port"
```

Every node, token and comment carries `loc: { start, end }` with `{ line, column, offset }` positions (`\n`, `\r\n`, `\r`, U+2028 and U+2029 each count as one line break). Property keys are positioned `Literal` / `Identifier` nodes, and `Property.loc` spans key through value. `parseToAst()` never throws for invalid input: lexical and parse errors are both collected in `errors` (with `code`, `line`, `column` and `offset`), and `tolerant: true` recovers from both and reports every one. See [docs/ast.md](https://github.com/CLDMV/jsonv/blob/master/docs/ast.md) for the node reference.

---

## 🔗 Internal References

```jsonv
{ port: 8080, backup: port, url: `http://${host}:${port}` }
```

Rules: file‑scoped only, forward references supported, no circular refs.

---

## 🧰 Year Utilities

```js
import { loadYear, getLoadedYear } from "@cldmv/jsonv/loader";
import { resolveYear, isPublishedYear, getPublishedYears } from "@cldmv/jsonv/year-resolver";

const jsonv2023 = await loadYear(2023); // resolves to 2021
const resolved = getLoadedYear(2017); // 2015
const published = getPublishedYears(); // [2011, 2015, 2020, 2021]
const isPublished = isPublishedYear(2021); // true
const nearest = resolveYear(2024); // 2021
```

---

## 🔍 Diagnostics

`diagnose()` returns detected year/features + compatibility flags (`json`, `json5`).
`info()` returns only detected year + parsed value.

---

## 🛠 Tooling

- ESLint plugin: published separately as [`@cldmv/eslint-plugin-jsonv`](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv) (this repo's lint config consumes the published package). For local co-development, clone that repo under the gitignored `plugins/eslint-plugin-jsonv/` path and run `npm run build:plugin` to link it against this repo's current build.
- Prettier plugin: published separately as [`@cldmv/prettier-plugin-jsonv`](https://github.com/CLDMV/jsonv-prettier-plugin-jsonv) for formatting `.jsonv` files.
- VS Code language support: published separately as [`jsonv-vscode`](https://github.com/CLDMV/jsonv-vscode); clone under the gitignored `plugins/vscode-jsonv/` for local co-development.

---

## 📚 Documentation

- **[Feature Matrix](https://github.com/CLDMV/jsonv/blob/master/docs/feature-matrix.md)** — features by ECMAScript year, lexical rules and excluded syntax
- **[Versioning & Exports](https://github.com/CLDMV/jsonv/blob/master/docs/versioning-and-exports.md)** — year-pinned entry points, the root alias, and ESM / CommonJS loading
- **[JSON5 Compatibility](https://github.com/CLDMV/jsonv/blob/master/docs/json5-compatibility.md)** — how jsonv relates to JSON5 and the `json` / `json5` / `jsonv` parse modes
- **[AST and Parser API](https://github.com/CLDMV/jsonv/blob/master/docs/ast.md)** — `parseToAst()`, node types, positions, tokens and comments for tooling
- **[Test Fixtures](https://github.com/CLDMV/jsonv/blob/master/tests/fixtures/README.md)** — per-year `features/` and `violations/` fixture layout
- **[Changelog](https://github.com/CLDMV/jsonv/tree/master/docs/changelog/)** — release notes for every version

[![CodeFactor]][codefactor_url] [![OpenSSF Scorecard]][ossf_scorecard_url] [![npms.io score]][npms_url] [![npm unpacked size]][npm_size_url] [![Repo size]][repo_size_url]

---

## 🤝 Contributing

Contributions are welcome — open an issue or a pull request on [GitHub](https://github.com/CLDMV/jsonv).

```bash
npm run dev       # uses src/ via json-dev condition
npm run build     # clean → ts → types → years → cjs
npm test          # Vitest, then the CommonJS entry tests
npm run lint      # ESLint v9 config
```

- Test runner: `npm test` (Vitest via `@cldmv/vitest-runner`, then `node:test` checks of the built CommonJS entry)
- Fixtures: [tests/fixtures/](https://github.com/CLDMV/jsonv/tree/master/tests/fixtures) with `features/` and `violations/` per year
- See [tests/fixtures/README.md](https://github.com/CLDMV/jsonv/blob/master/tests/fixtures/README.md) for layout

[![Contributors]][contributors_url] [![Sponsor shinrai]][sponsor_url]

---

## 🔗 Links

- **npm**: [@cldmv/jsonv](https://www.npmjs.com/package/@cldmv/jsonv)
- **GitHub**: [CLDMV/jsonv](https://github.com/CLDMV/jsonv)
- **Issues**: [GitHub Issues](https://github.com/CLDMV/jsonv/issues)
- **Changelog**: [docs/changelog/](https://github.com/CLDMV/jsonv/tree/master/docs/changelog/)

---

## 📄 License

[![GitHub license]][github_license_url] [![npm license]][npm_license_url]

Apache-2.0 © Shinrai / CLDMV

[npm version]: https://img.shields.io/npm/v/%40cldmv%2Fjsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_version_url]: https://www.npmjs.com/package/@cldmv/jsonv
[last commit]: https://img.shields.io/github/last-commit/CLDMV/jsonv?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[last_commit_url]: https://github.com/CLDMV/jsonv/commits
[npm last update]: https://img.shields.io/npm/last-update/%40cldmv%2Fjsonv?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_last_update_url]: https://www.npmjs.com/package/@cldmv/jsonv
[codefactor]: https://img.shields.io/codefactor/grade/github/CLDMV/jsonv?style=for-the-badge&logo=codefactor&logoColor=white&labelColor=F44A6A
[codefactor_url]: https://www.codefactor.io/repository/github/cldmv/jsonv
[openssf scorecard]: https://img.shields.io/ossf-scorecard/github.com/CLDMV/jsonv?style=for-the-badge&label=OpenSSF%20Scorecard
[ossf_scorecard_url]: https://scorecard.dev/viewer/?uri=github.com/CLDMV/jsonv
[npms.io score]: https://img.shields.io/npms-io/final-score/%40cldmv%2Fjsonv?style=for-the-badge&logo=npms&logoColor=white&labelColor=0B5D57
[npms_url]: https://npms.io/search?q=%40cldmv%2Fjsonv
[npm downloads]: https://img.shields.io/npm/dm/%40cldmv%2Fjsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_downloads_url]: https://www.npmjs.com/package/@cldmv/jsonv
[github downloads]: https://img.shields.io/github/downloads/CLDMV/jsonv/total?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[github_downloads_url]: https://github.com/CLDMV/jsonv/releases
[npm unpacked size]: https://img.shields.io/npm/unpacked-size/%40cldmv%2Fjsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_size_url]: https://www.npmjs.com/package/@cldmv/jsonv
[repo size]: https://img.shields.io/github/repo-size/CLDMV/jsonv?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[repo_size_url]: https://github.com/CLDMV/jsonv
[github license]: https://img.shields.io/github/license/CLDMV/jsonv.svg?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[github_license_url]: https://github.com/CLDMV/jsonv/blob/HEAD/LICENSE
[npm license]: https://img.shields.io/npm/l/%40cldmv%2Fjsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_license_url]: https://www.npmjs.com/package/@cldmv/jsonv
[coverage]: https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FCLDMV%2Fjsonv%2Fbadges%2Fcoverage.json&style=for-the-badge&logo=vitest&logoColor=white
[coverage_url]: https://github.com/CLDMV/jsonv/blob/badges/coverage.json
[contributors]: https://img.shields.io/github/contributors/CLDMV/jsonv.svg?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[contributors_url]: https://github.com/CLDMV/jsonv/graphs/contributors
[sponsor shinrai]: https://img.shields.io/github/sponsors/shinrai?style=for-the-badge&logo=githubsponsors&logoColor=white&labelColor=EA4AAA&label=Sponsor
[sponsor_url]: https://github.com/sponsors/shinrai
