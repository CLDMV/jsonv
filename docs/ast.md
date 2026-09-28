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
| `program` | `Program` | The root node. `program.body` is the document's value. Never `null`, even when there are errors (see below). |
| `comments` | `Comment[]` | Every comment in source order. Collected by default; `preserveComments: false` yields `[]`. |
| `tokens` | `Token[]` | Every non-comment token in source order, excluding the EOF token. |
| `errors` | `ParseError[]` | Collected lexical and parse errors in source order; `[]` when the input parsed cleanly. |

`options` accepts the usual [parse options](../src/api-types.mts) (`year`, `mode`, `tolerant`, `strictBigInt`, `strictOctal`, ...).

### Errors

`parseToAst` does not throw for invalid input. Lexical errors (an unterminated string or template, an invalid escape, a stray character, a literal the target `year` does not allow) and parse errors are both collected into `errors`, as plain objects of the same shape:

| Field | Contents |
|---|---|
| `message` | Human-readable message, without position information. |
| `code` | Machine-readable code: the lexer's specific code for lexical errors (`UNTERMINATED_STRING`, `INVALID_UNICODE_ESCAPE`, `INVALID_BIGINT`, ...), `PARSE_ERROR` for grammar errors. |
| `loc` | `{ start, end }` source location of the error. |
| `line`, `column`, `offset` | `loc.start` flattened: 1-based line, 0-based column and offset. |

```js
parseToAst("{ t: `abc }", { year: 2015 }).errors;
// [{ message: "Unterminated template literal", code: "UNTERMINATED_TEMPLATE",
//    loc: { start: { line: 1, column: 11, offset: 11 }, end: { line: 1, column: 11, offset: 11 } },
//    line: 1, column: 11, offset: 11 }]
```

Without `tolerant`, only the first error is collected. Lexing stops at the first lexical error, so `tokens` and `comments` hold only what was lexed before it, and a lexical error takes precedence over parse errors: it is the error `parseWithOptions` would throw for the same input.

With `tolerant: true`, the lexer skips the unreadable text and keeps going, and the parser recovers from grammar errors, so every error is reported, in source order. The lexer resynchronizes by skipping:

- a bad string: the rest of the string, through its closing quote or up to the end of the line;
- a bad template or template segment: the rest of the template, through its closing backtick;
- a comment rejected by `mode: "json"`, or an unterminated block comment: the whole comment;
- a bad number, or a word such as `-foo` or `_1`: the rest of the number or word;
- any other unexpected character: that character alone.

`program` is always a `Program`, never `null`. When there are errors it is the partial program recovered from the tokens that could be read. A value the lexer could not read is represented by a `Literal` whose `value` is `null` and whose `raw` is the unreadable source text; that text has no entry in `tokens`. Text that runs to the end of the input (an unterminated string or template) leaves any enclosing object or array unclosed, which `tolerant` mode also reports as parse errors.

`parse` and `parseWithOptions` still throw: a lexical error as a `LexerError`, a parse error as a `JsonvSyntaxError` (`LexerError` extends `JsonvSyntaxError`). `Parser#parse()` also throws lexical errors.

`parseToAst` never evaluates the document: internal references stay as `Identifier` / `MemberExpression` nodes and unresolved references are not reported.

## `Parser`

`parseToAst` wraps the lower-level `Parser` class from `@cldmv/jsonv/parser`:

```js
import { Parser } from "@cldmv/jsonv/parser";

const { program, tokens, comments, errors } = new Parser(text, { preserveComments: true }).parse();
```

`Parser#parse()` returns a `ParseResult`: `program` and `tokens` are always present, `comments` is present only when `preserveComments` is set, and `errors` is `undefined` when there are none. Unlike `parseToAst`, it throws lexical errors as a `LexerError`.

## Positions

Every node, token and comment has a `loc: { start, end }` whose positions are `{ line, column, offset }`:

- `line` is 1-based; `column` and `offset` are 0-based UTF-16 code-unit indexes.
- `text.slice(loc.start.offset, loc.end.offset)` is exactly the source text of the node, token or comment. A token's or node's `raw` equals it, except that template `raw` normalizes line terminators (see [Template line terminators](#template-line-terminators)).
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

A template literal without interpolation is represented as a `Literal` whose `raw` includes the backticks (with line terminators normalized as described under [Template line terminators](#template-line-terminators)).

### Template segments

Each `TemplateElement` has the same `loc` as its token, and `value.raw` is that token's source text, delimiters included. The quasis and the interpolated expressions between them tile the template with no gaps:

| Quasi | Token | `value.raw` for `` `a${x}b${y}c` `` | `value.cooked` |
|---|---|---|---|
| head | `TemplateHead` | `` `a${ `` (opening backtick through `${`) | `"a"` |
| middle | `TemplateMiddle` | `}b${` (the `}` closing the previous interpolation through the next `${`) | `"b"` |
| tail (`tail: true`) | `TemplateTail` | `` }c` `` (the `}` closing the last interpolation through the closing backtick) | `"c"` |

`value.cooked` is the segment text without delimiters and with escapes processed. Note that ESTree's `TemplateElement.value.raw` excludes the delimiters; here `raw` is the source text at `loc`, delimiters included, with line terminators normalized as below.

### Template line terminators

Templates follow ECMAScript: a CRLF pair or a lone CR inside a template is one line terminator whose cooked value (TV) and raw value (TRV) are both LF. So a document evaluates the same whatever its line endings are:

```js
parseWithOptions("{ t: `a\r\nb`, u: `c\rd` }"); // { t: "a\nb", u: "c\nd" }, the same as for "`a\nb`" and "`c\nd`"
```

This applies to the template token `value` and `raw`, to `TemplateElement.value.cooked` and `value.raw`, and to the `raw` of a template `Literal`. It matches ESTree parsers such as acorn, whose `TemplateElement.value.raw` is normalized the same way.

Positions are not normalized. `loc` always describes the original source, so the tokens and quasis of a CRLF document still tile it, line and column numbers count `\r\n` as one break, and `text.slice(loc.start.offset, loc.end.offset)` gives the exact source text of a template token or quasi, CR characters included. For a template, `raw` equals that slice with `/\r\n?/g` replaced by `"\n"`; for LF sources the two are identical.

Other characters are unaffected:

- An escaped `\r` (backslash then `r`) cooks to CR, and its `raw` keeps the two characters.
- U+2028 and U+2029 are kept as they are in both `cooked` and `raw`, as in ECMAScript.
- A line continuation (backslash followed by LF, CRLF, CR, U+2028 or U+2029) cooks to nothing in templates and in strings. In a template its `raw` is the backslash followed by the normalized line terminator. String tokens are not normalized: their `raw` is always the source slice.

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

Each token is `{ type, value, raw, loc }`. `type` is a `TokenType` member (exported from `@cldmv/jsonv/parser`), for example `TokenType.STRING` (`"String"`), `TokenType.LBRACE` (`"{"`) or `TokenType.TEMPLATE_HEAD` (`"TemplateHead"`). `raw` is the source text (for template tokens, with CRLF and lone CR normalized to LF; see [Template line terminators](#template-line-terminators)); `value` is the decoded value (the unescaped string, the numeric or BigInt value, the identifier name). Template tokens include their delimiters, so the tokens of a template tile its source with no gaps: `TemplateHead` runs from the opening backtick through `${`, and `TemplateMiddle` and `TemplateTail` start at the `}` that closes the preceding interpolation (for `` `http://${host}/path` `` the tail token is `` }/path` ``).
