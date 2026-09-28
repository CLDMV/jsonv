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
- An interpolation holds an internal reference (`${host}`, `${db.port}`), a nested template, or a scalar literal (string, number, boolean, `null`), stringified with JS template semantics (`String(value)`). A reference to an object or array value stringifies the same way JS does (`[1, 2]` → `"1,2"`).
- Inline object and array literals are not supported inside `${}`: `` `x${ {a: 1} }` `` and `` `x${ [1] }` `` are parse errors (`UNSUPPORTED_INTERPOLATION`) positioned on the literal. Only the `}` that balances `${` ends an interpolation, so a braced literal is reported at its opening `{` rather than misread as the end of the interpolation.
- File-scoped only, no external variables or imports.
- Forward references are supported; circular references are errors.

## Lexical rules (all years)

- Whitespace is allowed between tokens but **never inside a token**.
- Numeric separators must be inside digit groups (no leading/trailing or doubled `_`).
- BigInt suffix `n` must be directly adjacent to digits.
- Line terminators are `\n`, `\r\n` (one break), a lone `\r`, U+2028 and U+2029; each advances the reported line, and each ends a `//` comment.

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
  [`k_${x}`]: 1,       // computed key (not supported)
  tag: `v${ {a: 1} }`  // object literal in an interpolation (not supported)
}
```
