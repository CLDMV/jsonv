# @cldmv/jsonv

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

## API surface
Main entry: [src/index.mts](src/index.mts)

### Parse options (selected)
- `year`: 2011–2025 (defaults to latest)
- `mode`: `jsonv | json5 | json`
- `allowInternalReferences`: default `true`
- `strictBigInt`: require `n` for unsafe integers (default `false`)
- `strictOctal`: require `0o` (reject legacy `0755`, default `false`)
- `tolerant`: collect multiple errors
- `preserveComments`: keep comment nodes in results

### Stringify options (selected)
- `mode`: `jsonv | json5 | json`
- `bigint`: `native | string | object`
- `singleQuote`, `trailingComma`, `unquotedKeys`
- `preserveNumericFormatting`

Full types: [src/api-types.mts](src/api-types.mts)

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
- ESLint plugin: `plugins/eslint-plugin-jsonv` (build via `npm run build:plugin`)
- VS Code language support: `plugins/vscode-jsonv`

## Development
```bash
npm run dev       # uses src/ via json-dev condition
npm run build     # clean → ts → types → years → cjs → plugin
npm test          # Vitest
npm run lint      # ESLint v9 config
```

## License
Apache-2.0
