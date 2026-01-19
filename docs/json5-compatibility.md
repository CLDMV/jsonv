# JSON5 Compatibility

@cldmv/jsonv is a strict superset of JSON5. Any valid JSON5 document should parse under jsonv when using `mode: "json5"` or a year module that includes JSON5 features (all years do).

## JSON5 features supported

- Single-line and multi-line comments
- Trailing commas in objects and arrays
- Unquoted object keys (valid identifier names)
- Single-quoted strings
- Hex literals (`0xFF`)
- Leading/trailing decimal points (`.5`, `5.`)
- Explicit `+` sign (`+1`)
- `Infinity`, `-Infinity`, `NaN`
- Multiline strings via backslash continuation

## Differences from JSON5

- jsonv adds modern ES literal forms (binary/octal, BigInt, numeric separators, template literals) gated by year.
- jsonv adds internal references (file-scoped only, no external variables).
- Executable syntax is not supported (functions, classes, computed keys, shorthand props, tagged templates).

## Compatibility modes

- `mode: "json"` enforces strict JSON only.
- `mode: "json5"` allows JSON5 features but excludes jsonv extensions.
- `mode: "jsonv"` enables all jsonv features for the selected year.
