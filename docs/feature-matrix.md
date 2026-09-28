# Feature Matrix (Production Summary)

This document summarizes @cldmv/jsonv features by ECMAScript year and the core lexical rules enforced by the parser. For stable behavior, pin a year in production.

## Year modules and feature additions

| Year | Adds | Notes |
| --- | --- | --- |
| 2011 | JSON5 base + internal references (bare identifiers) | The JSON5 superset plus jsonv internal references. |
| 2015 | Binary & octal literals, template literals, template interpolation | Interpolation resolves internal refs only. |
| 2020 | BigInt literals | Decimal, hex, binary, and octal forms. |
| 2021 | Numeric separators (`_`) | All numeric literal forms. |
| 2022–2025 | No new syntax | Re-exports 2021 behavior. |

> Years are cumulative. Example: 2021 includes all 2011/2015/2020 features.

## JSON5 base (2011)

- Single-line and multi-line comments
- Trailing commas in objects and arrays
- Unquoted object keys (valid identifier names)
- Single-quoted strings
- Hex numbers (`0xFF`), leading/trailing decimal points (`.5`, `5.`)
- Explicit `+` sign (`+1`)
- `Infinity`, `-Infinity`, `NaN`
- Multiline strings via backslash line continuation

## Internal references (jsonv extension)

- Bare identifiers reference earlier values: `{ port: 8080, backup: port }`.
- Template interpolation (2015+): `` `http://${host}:${port}` ``.
- File-scoped only, no external variables or imports.
- Forward references are supported; circular references are errors.

## Lexical rules (all years)

- Whitespace is allowed between tokens but **never inside a token**.
- Numeric separators must be inside digit groups (no leading/trailing or doubled `_`).
- BigInt suffix `n` must be directly adjacent to digits.
- Line terminators are `\n`, `\r\n` (one break), a lone `\r`, U+2028 and U+2029; each advances the reported line, and each ends a `//` comment.
- Plain strings (single- or double-quoted) follow the rules below. A rejected string is a `JsonvSyntaxError` ("Unterminated string", code `UNTERMINATED_STRING`) positioned at the offending character; for a CRLF pair that is the CR.

### Line terminators in plain strings

| Character in a string | `jsonv` mode, year < 2019 | `jsonv` mode, year >= 2019 (and the default year) | `json5` mode, any year | `json` mode, any year |
| --- | --- | --- | --- | --- |
| Unescaped LF, CR or CRLF | Rejected | Rejected | Rejected | Rejected |
| Unescaped U+2028 or U+2029 | Rejected | Allowed | Allowed | Allowed |
| Backslash + LF, CR, CRLF, U+2028 or U+2029 (line continuation) | Allowed | Allowed | Allowed | Accepted (see below) |

A line continuation adds nothing to the string's value. RFC 8259 has no line continuations, but `json` mode does not reject them yet; strict enforcement of the JSON grammar in `json` mode is tracked in [#52](https://github.com/CLDMV/jsonv/issues/52).

The mode decides which grammar applies, and the year only matters in `jsonv` mode:

- `jsonv` mode follows ECMAScript for the selected year. ES2019 (the JSON superset proposal) made U+2028 and U+2029 legal in string literals; before that they are line terminators, which a string literal cannot contain.
- `json5` mode follows the JSON5 spec, which allows U+2028 and U+2029 in strings in every year.
- `json` mode follows RFC 8259, which allows any character except `"`, `\` and U+0000 to U+001F, so U+2028 and U+2029 are allowed and LF and CR are not.

The rule uses the requested year, so `parseWithOptions(text, { year: 2019 })` allows U+2028 and U+2029 even though 2019 otherwise shares the 2015 feature set. The `@cldmv/jsonv/2016` to `@cldmv/jsonv/2019` modules forward to the 2015 module, which parses as year 2015 and rejects them in `jsonv` mode; use the root `parseWithOptions` (from `@cldmv/jsonv`) with `year: 2019`, or a 2020+ module, for ES2019 string rules. The 2011 module parses in `json5` mode and allows them.

`stringify()` escapes U+2028 and U+2029 as `\u2028` and `\u2029` in every output mode, so its output parses under every year and mode.

## Excluded syntax (all years)

- Shorthand properties (`{ x }`), computed keys (`{ [k]: v }`)
- Spread/rest, destructuring, functions, classes, tagged templates
- Any construct requiring runtime evaluation

## Serialization policy highlights

- `stringify()` supports `json`, `json5`, and `jsonv` output modes.
- BigInt output modes: `native`, `string`, `object`.
- Numeric separators can be preserved via `preserveNumericFormatting`.

## Examples

Valid (2021+):
```jsonv
{
  flags: 0b1010_1111,
  budget: 1_234_567.89,
  id: 9007199254740992n,
  url: `http://${host}:${port}`
}
```

Invalid:
```jsonv
{
  value: 1_ 234,       // whitespace inside token
  name: { first },     // shorthand property (not supported)
  [`k_${x}`]: 1        // computed key (not supported)
}
```
