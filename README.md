# @cldmv/jsonv

[![npm version]][npm_version_url] [![npm downloads]][npm_downloads_url] [![GitHub downloads]][github_downloads_url] [![Last commit]][last_commit_url] [![npm last update]][npm_last_update_url]

[![Contributors]][contributors_url] [![Sponsor shinrai]][sponsor_url]

Modern JSON parser extending JSON5 with ES2015–2025 features and year‑pinned APIs.

## What it is
@cldmv/jsonv is a **static data** format: JSON5 plus modern literals, with features gated by ECMAScript year modules. It adds **internal references** (file‑scoped, defined‑before‑use) and forbids executable syntax (no functions, classes, computed keys, or shorthand props).

## Core features
- JSON5 superset (comments, trailing commas, single quotes, hex, etc.)
- Year‑pinned APIs: `@cldmv/jsonv/2011`, `/2015`, `/2020`, `/2021` (2022–2025 re‑export 2021)
- Modern literals: binary/octal, BigInt, numeric separators
- Internal references and template interpolation (ES2015+), including forward references
- Diagnostics: `diagnose()` and `info()` for year + feature detection
- Stringify with json/json5/jsonv modes, BigInt strategies, and raw JSON passthrough
- Dynamic year loading and resolver utilities (`loadYear`, `resolveYear`)
- Zero dependencies, hand‑written parser

## Install
```bash
npm install @cldmv/jsonv
```

## Quick start
```js
import { parse, stringify } from "@cldmv/jsonv";

const config = parse(`{
  port: 8080,
  host: "localhost",
  url: `http://${host}:${port}`,
  maxConnections: 1_000_000,
  bigValue: 9007199254740992n
}`);

const text = stringify(config);
```

## Year‑pinned API
Pin a year for stable grammar rules:
```js
import { parse } from "@cldmv/jsonv/2021"; // numeric separators + BigInt
import { parse as parse2015 } from "@cldmv/jsonv/2015"; // binary/octal + templates
import { parse as parse2011 } from "@cldmv/jsonv/2011"; // JSON5 base
```

See [docs/feature-matrix.md](docs/feature-matrix.md) and [docs/versioning-and-exports.md](docs/versioning-and-exports.md).

## Docs
- [docs/feature-matrix.md](docs/feature-matrix.md)
- [docs/versioning-and-exports.md](docs/versioning-and-exports.md)
- [docs/json5-compatibility.md](docs/json5-compatibility.md)
- [docs/ast.md](docs/ast.md) — AST, tokens and comments for tooling

## API surface
Main entry: [src/index.mts](src/index.mts)

### Parse options (selected)
- `year`: 2011–2025 (defaults to latest)
- `mode`: `jsonv` (default) | `json5` (exactly JSON5 1.0) | `json` (exactly RFC 8259 JSON); see [Parse modes](#parse-modes)
- `allowInternalReferences`: default `true`
- `strictBigInt`: require `n` for unsafe integers (default `false`)
- `strictOctal`: require `0o` (reject legacy `0755`, default `false`)
- `tolerant`: collect every syntax error instead of stopping at the first; `parseWithOptions` then throws them together as one `JsonvAggregateSyntaxError` (see [Errors](#errors))
- `preserveComments`: return comments (with positions) from `Parser#parse()`; see [AST for tooling](#ast-for-tooling)

### Parse modes
`mode: "json"` accepts exactly RFC 8259 JSON and `mode: "json5"` accepts exactly JSON5 1.0; `mode: "jsonv"` (the default) enables every jsonv feature of the selected year. A feature outside the mode throws a positioned `JsonvSyntaxError` with `code: "FEATURE_NOT_ALLOWED_IN_MODE"` naming the feature and the mode, and an unknown `mode` value throws a `TypeError`. `parse()` takes the options object in place of the reviver:
```js
import { parse } from "@cldmv/jsonv";

parse('{"a": [1, 2]}', { mode: "json" }); // { a: [1, 2] }
parse("{ a: 1, }", { mode: "json" }); // throws: Unquoted keys not allowed in JSON mode at line 1, column 2
parse("{ a: 1, b: a }", { mode: "json5" }); // throws: Internal references not allowed in JSON5 mode at line 1, column 11
```
The full feature × mode table is in [docs/json5-compatibility.md](docs/json5-compatibility.md#compatibility-modes).

### Stringify options (selected)
- `mode`: `jsonv | json5 | json`
- `bigint`: `native | string | object`
- `singleQuote`, `trailingComma`, `unquotedKeys`
- `preserveNumericFormatting`

Full types: [src/api-types.mts](src/api-types.mts)

## Errors
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

## AST for tooling
`parseToAst()` returns the positioned AST without evaluating it, for linters, formatters and editors:
```js
import { parseToAst } from "@cldmv/jsonv"; // also exported from "@cldmv/jsonv/parser"

const { program, comments, tokens, errors } = parseToAst("// port\n{ port: 8080 }");
program.body.properties[0].key; // { type: "Identifier", name: "port", loc: { start: { line: 2, column: 2, offset: 10 }, ... } }
comments[0].value; // " port"
```
Every node, token and comment carries `loc: { start, end }` with `{ line, column, offset }` positions (`\n`, `\r\n`, `\r`, U+2028 and U+2029 each count as one line break). Property keys are positioned `Literal` / `Identifier` nodes, and `Property.loc` spans key through value. `parseToAst()` never throws for invalid input: lexical and parse errors are both collected in `errors` (with `code`, `line`, `column` and `offset`), and `tolerant: true` recovers from both and reports every one. See [docs/ast.md](docs/ast.md) for the node reference.

## Internal references
```jsonv
{ port: 8080, backup: port, url: `http://${host}:${port}` }
```
Rules: file‑scoped only, forward references supported, no circular refs.

## Year utilities
```js
import { loadYear, getLoadedYear } from "@cldmv/jsonv/loader";
import { resolveYear, isPublishedYear, getPublishedYears } from "@cldmv/jsonv/year-resolver";

const jsonv2023 = await loadYear(2023); // resolves to 2021
const resolved = getLoadedYear(2017); // 2015
const published = getPublishedYears(); // [2011, 2015, 2020, 2021]
const isPublished = isPublishedYear(2021); // true
const nearest = resolveYear(2024); // 2021
```

## Diagnostics
`diagnose()` returns detected year/features + compatibility flags (`json`, `json5`).
`info()` returns only detected year + parsed value.

## Tests & fixtures
- Test runner: `npm test` (Vitest)
- Fixtures: [tests/fixtures/](tests/fixtures/) with `features/` and `violations/` per year
- See [tests/fixtures/README.md](tests/fixtures/README.md) for layout

## Tooling
- ESLint plugin: published separately as [`@cldmv/eslint-plugin-jsonv`](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv) (this repo's lint config consumes the published package). For local co-development, clone that repo under the gitignored `plugins/eslint-plugin-jsonv/` path and run `npm run build:plugin` to link it against this repo's current build.
- Prettier plugin: published separately as [`@cldmv/prettier-plugin-jsonv`](https://github.com/CLDMV/jsonv-prettier-plugin-jsonv) for formatting `.jsonv` files.
- VS Code language support: published separately as [`jsonv-vscode`](https://github.com/CLDMV/jsonv-vscode); clone under the gitignored `plugins/vscode-jsonv/` for local co-development.

## Development
```bash
npm run dev       # uses src/ via json-dev condition
npm run build     # clean → ts → types → years → cjs → plugin
npm test          # Vitest
npm run lint      # ESLint v9 config
```

## License

[![GitHub license]][github_license_url] [![npm license]][npm_license_url]

Apache-2.0 © Shinrai / CLDMV

[npm version]: https://img.shields.io/npm/v/%40cldmv%2Fjsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_version_url]: https://www.npmjs.com/package/@cldmv/jsonv
[npm downloads]: https://img.shields.io/npm/dm/%40cldmv%2Fjsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_downloads_url]: https://www.npmjs.com/package/@cldmv/jsonv
[npm last update]: https://img.shields.io/npm/last-update/%40cldmv%2Fjsonv?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_last_update_url]: https://www.npmjs.com/package/@cldmv/jsonv
[npm license]: https://img.shields.io/npm/l/%40cldmv%2Fjsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_license_url]: https://www.npmjs.com/package/@cldmv/jsonv
[github downloads]: https://img.shields.io/github/downloads/CLDMV/jsonv/total?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[github_downloads_url]: https://github.com/CLDMV/jsonv/releases
[last commit]: https://img.shields.io/github/last-commit/CLDMV/jsonv?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[last_commit_url]: https://github.com/CLDMV/jsonv/commits
[github license]: https://img.shields.io/github/license/CLDMV/jsonv.svg?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[github_license_url]: https://github.com/CLDMV/jsonv/blob/HEAD/LICENSE
[contributors]: https://img.shields.io/github/contributors/CLDMV/jsonv.svg?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[contributors_url]: https://github.com/CLDMV/jsonv/graphs/contributors
[sponsor shinrai]: https://img.shields.io/github/sponsors/shinrai?style=for-the-badge&logo=githubsponsors&logoColor=white&labelColor=EA4AAA&label=Sponsor
[sponsor_url]: https://github.com/sponsors/shinrai
