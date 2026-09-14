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
- ESLint plugin: published separately as [`@cldmv/eslint-plugin-jsonv`](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv) (this repo's lint config consumes the published package). For local co-development, clone that repo under the gitignored `plugins/eslint-plugin-jsonv/` path and run `npm run build:plugin` to link it against this repo's current build.
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
