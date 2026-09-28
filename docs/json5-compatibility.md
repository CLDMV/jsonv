# JSON5 Compatibility

@cldmv/jsonv is a strict superset of JSON5 1.0: every valid JSON5 document parses under jsonv with the same value, in every year module. `mode: "json5"` goes further and accepts **exactly** JSON5, and `mode: "json"` accepts **exactly** RFC 8259 JSON.

## JSON5 features supported

- Single-line and multi-line comments
- Trailing commas in objects and arrays
- Unquoted object keys: ECMAScript 5.1 IdentifierNames, including reserved words (`{ null: 1 }`), Unicode letters (`{ ümlaut: 1 }`) and `\uXXXX` escapes (`{ \u0061b: 1 }` is the key `ab`)
- Single-quoted strings
- Hex literals (`0xFF`, `-0xC0FFEE`)
- Leading/trailing decimal points (`.5`, `5.`)
- Explicit `+` sign (`+1`, `+.5`, `+0x10`, `+Infinity`)
- `Infinity`, `-Infinity`, `NaN` (also `+NaN`, `-NaN`)
- Multiline strings via backslash continuation (a backslash before LF, CR, CRLF, U+2028 or U+2029)
- Unescaped U+2028 and U+2029 in strings (in `mode: "json5"` in every year; in `mode: "jsonv"` from year 2019 on, as in ECMAScript; see [Line terminators in plain strings](feature-matrix.md#line-terminators-in-plain-strings))
- ECMAScript 5.1 string escapes: `\'`, `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\v`, `\0`, `\xXX`, `\uXXXX`; any other character escapes to itself (`\A` is `A`)
- JSON5 whitespace: tab, LF, VT, FF, CR, space, U+00A0, U+2028, U+2029, U+FEFF and the Unicode space separators

## Differences from JSON5

- jsonv adds modern ES literal forms (binary/octal, BigInt, numeric separators, template literals) gated by year.
- jsonv adds internal references (file-scoped only, no external variables).
- jsonv accepts numeric object keys (`{ 1: "a", 0xFF: "b" }`) and legacy octal literals (`0755`, unless `strictOctal`).
- Executable syntax is not supported (functions, classes, computed keys, shorthand props, tagged templates).

## Compatibility modes

`mode` is a parse option accepted by `parseWithOptions()`, `parse(text, options)`, `parseToAst()` and every year module's `parse()` / `parseWithOptions()`. It defaults to `"jsonv"`; any value other than `"jsonv"`, `"json5"` or `"json"` throws a `TypeError`.

| Feature | `json` | `json5` | `jsonv` |
| --- | --- | --- | --- |
| Double-quoted strings, numbers, `true` / `false` / `null`, objects, arrays | ✓ | ✓ | ✓ |
| Comments | ✗ | ✓ | ✓ |
| Trailing commas | ✗ | ✓ | ✓ |
| Unquoted (identifier) keys | ✗ | ✓ | ✓ |
| Single-quoted strings | ✗ | ✓ | ✓ |
| Hex literals | ✗ | ✓ | ✓ |
| Leading / trailing decimal point | ✗ | ✓ | ✓ |
| Leading `+` | ✗ | ✓ | ✓ |
| `Infinity` / `NaN` | ✗ | ✓ | ✓ |
| Escapes beyond JSON's (`\'`, `\v`, `\0`, `\x41`, `\A`, ...) and line continuations | ✗ | ✓ | ✓ |
| Unescaped control characters (U+0000-U+001F) other than LF / CR in strings | ✗ | ✓ | ✓ |
| Unescaped U+2028 / U+2029 in strings | ✓ | ✓ | ✓ (2019+) |
| Whitespace beyond space, tab, LF, CR | ✗ | ✓ | ✓ |
| `\1`-`\9` and `\0` followed by a digit | ✗ | ✗ | ✓ |
| Numeric keys | ✗ | ✗ | ✓ |
| Legacy octal / leading zeros (`0755`, `08`) | ✗ | ✗ | ✓ |
| Binary `0b` and octal `0o` literals | ✗ | ✗ | ✓ (2015+) |
| Template literals | ✗ | ✗ | ✓ (2015+) |
| Internal references | ✗ | ✗ | ✓ |
| BigInt literals | ✗ | ✗ | ✓ (2020+) |
| Numeric separators | ✗ | ✗ | ✓ (2021+) |

In `json` and `json5` modes the mode check runs before any year check, so the result does not depend on the selected year.

### Errors

A feature outside the mode is rejected with a `JsonvSyntaxError` whose `code` is `"FEATURE_NOT_ALLOWED_IN_MODE"`, whose message names the feature and the mode, and whose `line` / `column` / `offset` point at the feature:

```js
import { parseWithOptions } from "@cldmv/jsonv";

parseWithOptions('{"a": 1,}', { mode: "json" });
// throws JsonvSyntaxError "Trailing commas not allowed in JSON mode at line 1, column 7"
//   { code: "FEATURE_NOT_ALLOWED_IN_MODE", line: 1, column: 7, offset: 7 }

parseWithOptions("{ n: 1n }", { mode: "json5" });
// throws JsonvSyntaxError "BigInt literals not allowed in JSON5 mode"
//   { code: "FEATURE_NOT_ALLOWED_IN_MODE", line: 1, column: 6, offset: 6 }
```

Token-level features (comments, string forms and escapes, number forms, templates, whitespace) are rejected by the lexer; structural ones (trailing commas, key forms, unsigned `Infinity` / `NaN` values, internal references) by the parser. `parseToAst()` follows its usual split: parser-level mode errors are collected in `errors` (all of them with `tolerant: true`), and lexer-level mode errors are thrown.
