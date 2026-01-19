# @cldmv/jsonv Test Fixtures

This directory contains test fixtures demonstrating all supported @cldmv/jsonv features organized by ECMAScript year.

## Organization

```
tests/fixtures/
├── 2011/              # ES2011/JSON5 base features
│   ├── features/      # Individual feature demonstrations (100-200 lines each)
│   ├── violations/    # Error cases
│   └── json5-complete.jsonv  # Comprehensive JSON5 demo
├── 2015/              # ES2015 additions
│   ├── features/      # Binary, octal, template literals
│   ├── violations/    # Error cases
│   └── es2015-complete.jsonv
├── 2020/              # ES2020 BigInt
│   ├── features/      # BigInt in decimal, hex, binary, octal
│   ├── violations/    # Error cases
│   └── es2020-complete.jsonv
├── 2021/              # ES2021 numeric separators
│   ├── violations/    # Error cases
│   └── es2021-complete.jsonv
├── 2022/              # ES2022 (no new literal syntax)
│   └── es2022-complete.jsonv
├── 2023/              # ES2023 (no new literal syntax)
│   └── es2023-complete.jsonv
├── 2024/              # ES2024 (no new literal syntax)
│   └── es2024-complete.jsonv
└── 2025/              # ES2025 (no new literal syntax)
    └── es2025-complete.jsonv
```

## Feature Files

### ES2011/JSON5 Base (2011/)

**Feature files** (`features/`):
- `comments-single-line.jsonv` - Single-line comments (`//`)
- `comments-multi-line.jsonv` - Multi-line comments (`/* */`)
- `trailing-commas.jsonv` - Trailing commas in objects and arrays
- `unquoted-keys.jsonv` - Unquoted object keys (valid identifiers)
- `single-quoted-strings.jsonv` - Single-quoted strings (`'string'`)
- `hex-literals.jsonv` - Hexadecimal numbers (`0xFF`, `0xDEADBEEF`)
- `decimal-points.jsonv` - Leading/trailing decimal points (`.5`, `5.`)
- `infinity-nan.jsonv` - `Infinity`, `-Infinity`, `NaN`
- `multiline-strings.jsonv` - Multi-line strings with backslash continuation
- `internal-refs-bare.jsonv` - Internal references via bare identifiers (@cldmv/jsonv extension)

**Comprehensive**: `json5-complete.jsonv` - All JSON5 features in one file

**Violations** (`violations/`):
- `whitespace-in-number.jsonv` - Spaces inside numeric tokens (invalid)
- `circular-reference.jsonv` - Circular internal references (invalid)
- `forward-reference.jsonv` - Reference before definition (invalid)
- `unterminated-comment.jsonv` - Unterminated multi-line comment (invalid)
- `invalid-hex.jsonv` - Invalid hex literal syntax (invalid)

### ES2015 (2015/)

**Feature files** (`features/`):
- `binary-literals.jsonv` - Binary numbers (`0b1010`, `0b11110000`)
- `octal-literals.jsonv` - Octal numbers (new `0o755` and legacy `0755` syntax)
- `template-literals.jsonv` - Backtick multi-line strings
- `template-interpolation.jsonv` - Template interpolation with internal refs (@cldmv/jsonv extension)

**Comprehensive**: `es2015-complete.jsonv` - All ES2015 + JSON5 features

**Violations** (`violations/`):
- `shorthand-property.jsonv` - Shorthand properties not supported (invalid)
- `computed-property.jsonv` - Computed property names not supported (invalid)
- `arrow-function.jsonv` - Arrow functions not allowed (invalid)
- `tagged-template.jsonv` - Tagged templates not allowed (invalid)

### ES2020 (2020/)

**Feature files** (`features/`):
- `bigint-literals.jsonv` - BigInt decimal literals (`9007199254740992n`)
- `bigint-hex.jsonv` - BigInt hexadecimal (`0xFFFFFFFFFFFFFFFFn`)
- `bigint-binary.jsonv` - BigInt binary (`0b1111...n`)
- `bigint-octal.jsonv` - BigInt octal (`0o777n`)

**Comprehensive**: `es2020-complete.jsonv` - All ES2020 + ES2015 + JSON5 features

**Violations** (`violations/`):
- `missing-bigint-suffix.jsonv` - Large number without `n` suffix (invalid)
- `bigint-space-before-suffix.jsonv` - Space before `n` suffix (invalid)

### ES2021 (2021/)

**Comprehensive**: `es2021-complete.jsonv` - All ES2021 features including:
- Numeric separators in decimal (`1_000_000`)
- Numeric separators in hex (`0xFF_AA_BB`)
- Numeric separators in binary (`0b1111_0000`)
- Numeric separators in octal (`0o755_644`)
- Numeric separators in BigInt (`9_007_199_254_740_992n`)

**Violations** (`violations/`):
- `double-separator.jsonv` - Double underscore (`1__000`) (invalid)
- `separator-at-start.jsonv` - Separator at number start (`_1000`) (invalid)
- `separator-at-end.jsonv` - Separator at number end (`1000_`) (invalid)
- `separator-after-prefix.jsonv` - Separator after prefix (`0x_FF`) (invalid)

### ES2022-2025 (2022/, 2023/, 2024/, 2025/)

These years add no new jsonv literal syntax. Comprehensive files demonstrate all cumulative features (numeric separators + BigInt + ES2015 + JSON5) in various modern application contexts:

- **2022**: Enterprise platform, cloud infrastructure
- **2023**: AI/ML models, blockchain, distributed systems
- **2024**: Quantum computing, neuromorphic systems, IoT
- **2025**: AGI research, space infrastructure, climate simulation, biotechnology, fusion reactors

## File Sizing

- **Feature files**: 100-200 lines with realistic configuration bloat
- **Comprehensive files**: 200-300+ lines combining all features for that year
- **Violation files**: Small (3-15 lines) demonstrating specific parse errors

## Test Strategy

Each fixture demonstrates:
1. **Realistic use cases** - Server configs, database settings, financial data, scientific values, hardware registers
2. **Edge cases** - Large numbers, nested structures, mixed formats
3. **Feature combinations** - Multiple features working together
4. **Clear documentation** - Comments explaining what's being tested

## Usage

Import fixtures in tests using the provided test runner:

```javascript
import { readFileSync } from 'fs';
import { parse } from '@cldmv/jsonv/2021';

const fixture = readFileSync('tests/fixtures/2021/es2021-complete.jsonv', 'utf-8');
const result = parse(fixture);
```

See `tests/fixtures.test.ts` for the complete test runner implementation.

## Internal References (@cldmv/jsonv Extension)

A key distinguishing feature of @cldmv/jsonv is **internal references**:

```jsonv
{
  port: 8080,
  backup: port,  // References port value (8080)
  host: "localhost",
  url: `http://${host}:${port}`  // Template interpolation (ES2015+)
}
```

**Rules**:
- Must be defined before use (left-to-right, top-to-bottom evaluation)
- File-scoped only (no external context)
- Circular references are parse errors
- Nested access supported: `server.port`

Available in:
- **ES2011+**: Bare identifier references
- **ES2015+**: Template interpolation (`${}`)

## Feature Matrix

See [spec/feature-matrix.md](../../spec/feature-matrix.md) for the complete feature → ES year mapping and lexical rules.
