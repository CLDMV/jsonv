# AST and Parser API

`@cldmv/jsonv` exposes the positioned AST it builds while parsing, so linters, formatters and editors (for example [`@cldmv/eslint-plugin-jsonv`](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv)) can work on the same tree the parser uses instead of re-implementing the grammar.

## `parseToAst(text, options?)`

The stable entry point for tooling. It is exported from the package root and from the `@cldmv/jsonv/parser` subpath:

```js
import { parseToAst } from "@cldmv/jsonv";
// or: import { parseToAst, TokenType } from "@cldmv/jsonv/parser";

const { program, comments, tokens, errors } = parseToAst("// port\n{ port: 8080 }");
```

It returns an `AstResult` in which every list is always present:

| Field | Type | Contents |
|---|---|---|
| `program` | `Program` | The root node. `program.body` is the document's value. |
| `comments` | `Comment[]` | Every comment in source order. Collected by default; `preserveComments: false` yields `[]`. |
| `tokens` | `Token[]` | Every non-comment token in source order, excluding the EOF token. |
| `errors` | `ParseError[]` | Collected parse errors; `[]` when the input parsed cleanly. |

`options` accepts the usual [parse options](../src/api-types.mts) (`year`, `mode`, `tolerant`, `strictBigInt`, `strictOctal`, ...). Parse errors are collected rather than thrown: only the first one unless `tolerant: true`, in which case the parser recovers and keeps going. Lexical errors (an unterminated string, an invalid escape, a year-gated literal, a token form the `mode` does not allow) cannot produce a token stream, so they throw a `JsonvSyntaxError` carrying `line`, `column` and `offset`. Structural `mode` violations (trailing commas, key forms, internal references) are parse errors and are collected with `code: "FEATURE_NOT_ALLOWED_IN_MODE"`; see [JSON5 compatibility](json5-compatibility.md#compatibility-modes).

`parseToAst` never evaluates the document: internal references stay as `Identifier` / `MemberExpression` nodes and unresolved references are not reported.

## `Parser`

`parseToAst` wraps the lower-level `Parser` class from `@cldmv/jsonv/parser`:

```js
import { Parser } from "@cldmv/jsonv/parser";

const { program, tokens, comments, errors } = new Parser(text, { preserveComments: true }).parse();
```

`Parser#parse()` returns a `ParseResult`: `program` and `tokens` are always present, `comments` is present only when `preserveComments` is set, and `errors` is `undefined` when there are none.

## Positions

Every node, token and comment has a `loc: { start, end }` whose positions are `{ line, column, offset }`:

- `line` is 1-based; `column` and `offset` are 0-based UTF-16 code-unit indexes.
- `text.slice(loc.start.offset, loc.end.offset)` is exactly the source text of the node, token or comment.
- `\n`, `\r\n` (one break), a lone `\r`, U+2028 and U+2029 each end a line, matching ECMAScript and ESLint. Line comments also end at any of them.
- Tokens that span lines (strings with line continuations, multi-line templates and block comments) start where their first character is.

## Node types

All node shapes are exported as TypeScript types from the package root and from `@cldmv/jsonv/parser`.

| Node | Fields | `loc` spans |
|---|---|---|
| `Program` | `body: Expression` | The whole input, offset `0` to the end of the text (surrounding whitespace and comments included). |
| `ObjectExpression` | `properties: Property[]` | `{` through `}`. |
| `Property` | `key: Literal \| Identifier`, `value: Expression`, `computed: false` | The key through the end of the value. |
| `ArrayExpression` | `elements: (Expression \| null)[]` (never `null` in jsonv) | `[` through `]`. |
| `Literal` | `value`, `raw`, `bigint?` | The literal token. `bigint` holds the decimal string for BigInt literals. |
| `Identifier` | `name` | The identifier. |
| `MemberExpression` | `object`, `property: Identifier`, `computed: false` | The first identifier through the last property. |
| `TemplateLiteral` | `quasis: TemplateElement[]`, `expressions: Expression[]` | The opening backtick through the closing backtick. |
| `TemplateElement` | `value: { raw, cooked }`, `tail` | The quasi's own token, delimiters included (see below). |

A template literal without interpolation is represented as a `Literal` whose `raw` includes the backticks.

### Template segments

Each `TemplateElement` has the same `loc` as its token, and `value.raw` is that token's source text, delimiters included. The quasis and the interpolated expressions between them tile the template with no gaps:

| Quasi | Token | `value.raw` for `` `a${x}b${y}c` `` | `value.cooked` |
|---|---|---|---|
| head | `TemplateHead` | `` `a${ `` (opening backtick through `${`) | `"a"` |
| middle | `TemplateMiddle` | `}b${` (the `}` closing the previous interpolation through the next `${`) | `"b"` |
| tail (`tail: true`) | `TemplateTail` | `` }c` `` (the `}` closing the last interpolation through the closing backtick) | `"c"` |

`value.cooked` is the segment text without delimiters and with escapes processed. Note that ESTree's `TemplateElement.value.raw` excludes the delimiters; here `raw` always equals `text.slice(loc.start.offset, loc.end.offset)`.

### Property keys

`Property.key` is a positioned node:

- `Literal` for quoted keys (`"a"`, `'a'`) and numeric keys (`3`, `0x10`, `7n`);
- `Identifier` for unquoted keys, including keyword keys such as `true`, `null`, `Infinity` and `NaN`.

The evaluated object key is `key.name` for an `Identifier` and `String(key.value)` for a `Literal`, so `{ 0x10: 1 }` produces the key `"16"`.

## Comments

```js
parseToAst("// lead\n{ /* inner */ a: 1 }").comments;
// [
//   { type: "Line",  value: " lead",   loc: { start: { line: 1, column: 0, offset: 0 },  end: { line: 1, column: 7, offset: 7 } } },
//   { type: "Block", value: " inner ", loc: { start: { line: 2, column: 2, offset: 10 }, end: { line: 2, column: 13, offset: 21 } } }
// ]
```

`value` is the comment text without its delimiters; `loc` covers the delimiters. Comments may appear between any two tokens, including between a key and its colon and inside template interpolations.

## Tokens

Each token is `{ type, value, raw, loc }`. `type` is a `TokenType` member (exported from `@cldmv/jsonv/parser`), for example `TokenType.STRING` (`"String"`), `TokenType.LBRACE` (`"{"`) or `TokenType.TEMPLATE_HEAD` (`"TemplateHead"`). `raw` is the exact source text; `value` is the decoded value (the unescaped string, the numeric or BigInt value, the identifier name). Template tokens include their delimiters, so the tokens of a template tile its source with no gaps: `TemplateHead` runs from the opening backtick through `${`, and `TemplateMiddle` and `TemplateTail` start at the `}` that closes the preceding interpolation (for `` `http://${host}/path` `` the tail token is `` }/path` ``).
