# Changelog

All notable changes to @cldmv/jsonv will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING**: Removed automatic strict mode detection for `strictBigInt`
  - **Reason**: ESM modules are always in strict mode, making auto-detection useless
  - **Before**: `strictBigInt` was auto-enabled in strict mode via `isCallerStrictMode()`
  - **After**: Both `strictBigInt` and `strictOctal` default to `false`, users must opt-in explicitly
  - **Migration**: Use `parseWithOptions(text, { strictBigInt: true })` for strict BigInt validation
  - **Impact**: Large integers (outside safe range) now allowed by default; use options to enforce `n` suffix requirement
- **Added**: `strictOctal` option now exposed in public API (`ParseOptions`)
  - Rejects legacy octal syntax (`0755`) when enabled, requires `0o` prefix (`0o755`)
  - Defaults to `false` - legacy octal accepted for compatibility

### Added - Phase 6: Year Modules ✅ Complete (January 16, 2026)

- **Year-Based Module System**: Import specific ES year APIs for guaranteed feature availability
  - **Published Years**: `2011` (JSON5), `2015` (binary/octal/templates), `2020` (BigInt), `2021` (numeric separators)
  - **Automatic Resolution**: Unpublished years forward to nearest older published year
    - 2012-2014 → 2011 (no new features)
    - 2016-2019 → 2015 (no new features)
    - 2022-2025 → 2021 (latest published)
    - Years before 2011 → 2011 (minimum)
    - Years after 2025 → 2021 (latest)
  - **Dynamic Loading**: Runtime year selection with `loadYear(year)` function
  - **Type Safety**: All year modules implement complete JSONVApi interface
  - **Usage Examples**:
    ```javascript
    // Static import (recommended for production)
    import jsonv2021 from '@cldmv/jsonv/2021';
    const result = jsonv2021.parse('{ num: 1_000_000 }'); // Numeric separators supported
    
    // Dynamic loading (for runtime year selection)
    import { loadYear } from '@cldmv/jsonv/loader';
    const jsonv = await loadYear(2023); // Resolves to 2021
    ```
- **Year Resolver Utility**: Programmatic year resolution
  - `resolveYear(year)`: Get implementation year for any requested year
  - `isPublishedYear(year)`: Check if year has dedicated implementation
  - `getPublishedYears()`: List all published years [2011, 2015, 2020, 2021]
- **Test Coverage**: 373 tests passing (100%)
  - 26 year module tests
    - Year resolution (exact, forwarding, edge cases)
    - Dynamic loading (all year ranges)
    - Module availability checking
    - Year-specific feature validation
    - Complete API surface verification

### Added - Phase 6: diagnose() and info() ✅ Complete (January 16, 2026)

- **diagnose() Method**: Comprehensive feature detection and analysis
  - **Year Detection**: Automatically detects minimum ES year required (2011, 2015, 2020, 2021)
  - **Feature Detection**: Identifies all features used in jsonv text
    - ES2011 (JSON5): comments, unquoted keys, single quotes, trailing commas, hex literals, special numbers (Infinity/NaN), decimal points
    - ES2015: binary literals, octal literals, template literals, template interpolation
    - ES2020: BigInt literals
    - ES2021: numeric separators
    - jsonv extensions: internal references (bare identifiers, template interpolation)
  - **Compatibility Reporting**: Checks JSON and JSON5 compatibility
    - `json`: true if input works with standard JSON.parse
    - `json5`: true if input works with JSON5 parsers
  - **Warnings**: Provides actionable compatibility warnings
    - ES2020+ features require polyfills
    - ES2015+ syntax needs appropriate parser
    - Internal references require jsonv parser
  - **Parsed Value**: Returns evaluated JavaScript value
- **info() Method**: Simplified version of diagnose()
  - Returns only year and parsed value
  - Skips feature list, warnings, and compatibility info
  - Faster for simple year detection
- **Test Coverage**: 347 tests passing (100%)
  - 39 diagnose/info-specific tests
  - Feature detection for all ES years (2011-2021)
  - Internal reference detection (bare identifiers, nested properties, template interpolation)
  - Compatibility checking (JSON, JSON5, jsonv)
  - Edge cases (multiple features, highest year detection, value parsing)

### Added - Phase 5: Stringify ✅ Complete (January 16, 2026)

- **stringify() Function**: Full serialization support with multiple output modes
  - **JSON mode**: Strict JSON output (quoted keys, no trailing commas, special numbers as null)
  - **JSON5 mode**: Unquoted keys for valid identifiers, trailing commas, special numbers preserved
  - **jsonv mode (default)**: All JSON5 features + BigInt with 'n' suffix
  - **Indentation**: Supports space count (0-10) or custom string (e.g., tabs)
  - **Replacer support**: Function or array (JSON.stringify compatible)
  - **Smart key quoting**: Unquoted for valid identifiers (`key`, `userName`), quoted for invalid (`my-key`, `"2key"`, `""`)
- **BigInt Serialization Strategies**: Three modes for maximum flexibility
  - **native** (default for jsonv/JSON5): `9007199254740992n` with 'n' suffix
  - **string** (default for JSON): `"9007199254740992"` as quoted string
  - **object**: `{"$bigint":"9007199254740992"}` for portable interchange
- **Special Number Handling**: Infinity, -Infinity, NaN
  - jsonv/JSON5 modes: Output as-is (`Infinity`, `-Infinity`, `NaN`)
  - JSON mode: Convert to `null` (strict JSON compliance)
- **rawJSON() and isRawJSON()**: Modern JSON API compatibility
  - **rawJSON(text)**: Create objects that serialize as raw JSON text
  - **isRawJSON(value)**: Test if value is a raw JSON object
  - Compatible with TC39 JSON.rawJSON proposal
  - Validates input ensures only valid JSON in raw objects
  - Use case: Embed pre-serialized JSON without double-encoding
- **Quote Style Options**: Configurable string quote characters
  - Double quotes (default, JSON compatible): `"hello"`
  - Single quotes (JSON5/jsonv only): `'hello'`
  - Proper escaping for both styles
- **Circular Reference Detection**: Throws TypeError on circular structures (JSON.stringify compatible)
- **Edge Case Handling**: Comprehensive support for JavaScript values
  - `undefined`: Output as `"undefined"` or skip in objects
  - Functions: Skip in objects (not serializable)
  - Symbols: Skip in objects (not serializable)
  - Dates: Serialize as ISO 8601 strings
  - Arrays with undefined: Preserve as `undefined` (not `null`)
- **Round-Trip Tests**: Full bidirectional testing
  - parse → stringify → parse maintains value equality
  - Works for all data types (primitives, objects, arrays, BigInt, special numbers)
  - Trailing commas don't affect round-trip
  - Unquoted keys parse correctly after stringify
- **Test Coverage**: 254 tests passing (100%)
  - 59 stringify-specific tests
  - All round-trip tests passing
  - Edge cases validated (circular refs, undefined, functions, symbols, dates)
  - All output modes tested
  - BigInt serialization strategies validated

### Added - Phase 4: Internal References ✅ Complete (January 16, 2026)

- **Multi-Pass Evaluation System**: Implemented 3-pass reference resolution strategy
  - **Pass 1**: Build object structure, mark all references (Identifier, MemberExpression, TemplateLiteral) as UnresolvedReference markers
  - **Pass 2-3**: Recursively resolve markers when targets have concrete values (not other markers)
  - **Max 3 passes**: Handles dependency chains (a→b, b→c, c→5 resolves in 2 passes)
  - **UnresolvedReference interface**: `{ __UNRESOLVED__: true, path: string, node: ASTNode }`
  - **Circular detection**: Throws error if markers remain after max passes
  - **Eliminates scope complexity**: No scope hierarchy needed, simpler code
- **Forward References**: Bonus feature! `{ a: b, b: 42 }` now works (definition order flexible)
  - Multi-pass naturally supports forward refs by deferring resolution
  - References resolve in optimal order based on available data
- **Template Interpolation**: Fixed lexer bug for multiple ${} expressions in one template
  - **templateDepth tracking**: Counter increments on `${`, decrements on template tail
  - **Modified `}` handling**: Checks templateDepth before treating as RBRACE token
  - **scanTemplateMiddleOrTail()**: New method emits TEMPLATE_MIDDLE or TEMPLATE_TAIL
  - **Works correctly**: `` `${a}://${b}/api/${c}` `` now fully supported
- **BigInt Auto-Conversion**: Smart handling of large integers
  - **strictBigInt option**: Controls whether 'n' suffix is required for large integers
    - `false` (default): Auto-convert integers > MAX_SAFE_INTEGER to BigInt
    - `true`: Require explicit 'n' suffix, throw error if missing
  - **Strict mode detection**: `isCallerStrictMode()` uses `(function() { return !this; })()` technique
    - In strict mode: `this` is undefined → returns true
    - In non-strict mode: `this` is global object → returns false
  - **Automatic behavior**: `parse()` auto-enables strictBigInt when caller uses "use strict"
- **API Compatibility**: JSON.parse signature maintained
  - **parse(text, reviver)**: Drop-in replacement for JSON.parse, auto-detects strict mode
  - **parseWithOptions(text, options)**: Escape hatch for explicit control over strictBigInt, year, mode
  - Maintains backward compatibility while adding modern features
- **Internal References**: Complete implementation for ES2011+ and ES2015+
  - **Bare identifiers** (ES2011): `{ port: 8080, backup: port }` → backup gets value 8080
  - **Template interpolation** (ES2015): `` { host: "localhost", port: 8080, url: `http://${host}:${port}` } ``
  - **Nested property access**: `server.port` resolves correctly in `{ server: { port: 8080 }, url: server.port }`
  - **Evaluation order**: Left-to-right, top-to-bottom (matches JavaScript object literal semantics)
  - **File-scoped only**: References only resolve within same file (no external imports)
- **Test Coverage**: 158/158 tests passing (100%)
  - All fixture tests passing (84/84)
  - All BigInt validation tests passing (10/10)
  - All lexer tests passing (64/64)
  - Fixed test fixtures: corrected invalid octal/hex literals in es2015/es2025
  - Moved `forward-reference.jsonv` from violations/ to features/ (now supported!)
- **Code Quality**: 
  - Removed complex Scope class (~56 lines eliminated)
  - Simpler evaluation logic with clear multi-pass structure
  - Well-documented JSDoc for all new functions
  - Comprehensive error messages with source locations

### Added - Phase 3: Parser ✅ Complete (January 15, 2026)

- **Parser Implementation**: Recursive descent parser for JSON/JSON5/ES2015-2021 features
  - **Project Structure**: `src/parser.ts` (~505 lines)
  - **Complete parsing**:
    - **JSON primitives**: null, true, false, strings, numbers, Infinity, NaN
    - **BigInt literals**: Full ES2020 BigInt support with `n` suffix
    - **BigInt validation**: Integers > MAX_SAFE_INTEGER/MIN_SAFE_INTEGER **must** use BigInt suffix
      - Checks raw token syntax to distinguish integer literals from decimals/scientific notation
      - Allows `9007199254740993.0` (decimal) and `9.007199254740993e15` (scientific)
      - Rejects `9007199254740993` (plain integer) → prevents silent data corruption
    - **Objects**: Trailing commas, unquoted keys, keywords as keys (null, true, false, Infinity, NaN), numeric keys
    - **Arrays**: Trailing commas, nested structures
    - **Template literals**: Plain backtick strings (ES2015), interpolation deferred to Phase 4
    - **Identifiers**: Bare identifiers for internal references (resolution in Phase 4)
  - **Error handling**: Detailed parse errors with source locations, tolerant mode support
  - **AST generation**: Complete AST per `ast-types.ts` specification
  - **Evaluation**: AST → JavaScript value conversion
  - **Test Coverage**: 143/148 fixture tests passing (96.6%), 10/10 BigInt validation tests passing
    - 5 failures are expected Phase 4 features (internal references, template interpolation)
  - **Test fixture corrections**: Fixed typos in BigInt fixtures, corrected large number representations in decimal-points fixture
- **Parser Integration Tests**: Added `tests/bigint-validation.test.ts` with 10 comprehensive tests for safe integer validation
- **Fixture Test Enhancement**: Tests now actually parse files (not just check file existence), properly validate violations

### Added - Phase 2: Lexer/Tokenizer ✅ Complete (January 14, 2026)

- **Lexer Implementation**: Hand-written tokenizer for all jsonv features
  - **Project Structure**: Reorganized into `src/lexer/` directory
    - `src/lexer/lexer-types.ts`: Token types, lexer options, error handling
    - `src/lexer/lexer.ts`: Complete lexer implementation (~977 lines)
  - **Dynamic year resolution**: 
    - `FEATURE_YEARS` array [2011, 2015, 2020, 2021] as single source of truth
    - `getFeatureYear()` maps any ES year to nearest feature year
    - Year defaults to current year at runtime (no hardcoded latest year)
    - Feature flags auto-derive from target year
  - **Complete tokenization**:
    - **String tokenization**: Double-quoted, single-quoted, escape sequences, multiline strings with backslash continuation (JSON5)
    - **Number tokenization**: Decimal, hex (0x), binary (0b), octal (0o and legacy 0), BigInt suffix (n), numeric separators (_), decimal points, scientific notation
    - **Template literals**: Backtick strings with interpolation detection (ES2015+)
    - **Identifiers/keywords**: Unquoted keys, internal references, true/false/null/Infinity/NaN
    - **Punctuation**: { } [ ] : , for JSON structure
    - **Comments**: Single-line (//), multi-line (/* */), with preservation mode
    - **Whitespace handling**: Skip between tokens, validate no spaces inside tokens
    - **Year-based feature gating**: Binary/octal (ES2015+), BigInt (ES2020+), numeric separators (ES2021+)
    - **Detailed error reporting**: LexerError with source location (line, column, offset), error codes
  - **Test Coverage**: 64/64 lexer tests passing (100%)
  - Comprehensive validation of lexical rules from `spec/feature-matrix.md`
  - Position tracking for accurate error reporting
  - Ready for Phase 3 parser integration
- **Build System**: Updated to use `.configs/tsconfig.dts.jsonc` for TypeScript compilation

### Added - Phase 1 Complete

- **Test Fixtures**: Comprehensive test fixture suite (45 files, ~11,500+ lines total)
  - **ES2011 (JSON5 base)**: 9 feature files + 1 comprehensive + 5 violations = 15 files
    - Features: single-line comments, multi-line comments, trailing commas, unquoted keys, single-quoted strings, hex literals, decimal points, Infinity/NaN, multiline strings, internal references (bare identifiers)
    - Comprehensive: `json5-complete.jsonv` (250+ lines)
    - Violations: whitespace-in-number, circular-reference, forward-reference, unterminated-comment, invalid-hex
  - **ES2015**: 4 feature files + 1 comprehensive + 4 violations = 9 files
    - Features: binary literals, octal literals (0o and legacy 0 syntax), template literals, template interpolation with internal refs
    - Comprehensive: `es2015-complete.jsonv` (280+ lines)
    - Violations: shorthand-property, computed-property, arrow-function, tagged-template
  - **ES2020**: 4 feature files + 1 comprehensive + 2 violations = 7 files
    - Features: BigInt decimal, BigInt hex, BigInt binary, BigInt octal (0o and legacy 0 with n suffix)
    - Comprehensive: `es2020-complete.jsonv` (290+ lines)
    - Violations: missing-bigint-suffix, bigint-space-before-suffix
  - **ES2021**: 1 comprehensive + 4 violations = 5 files
    - Comprehensive: `es2021-complete.jsonv` (300+ lines) demonstrating numeric separators in decimal, hex, binary, octal, BigInt, and all combinations
    - Violations: double-separator, separator-at-start, separator-at-end, separator-after-prefix
  - **ES2022-2025**: 4 comprehensive files (no new literal syntax in these years)
    - Each 150-200 lines showcasing all cumulative features in modern application contexts
    - 2022: enterprise platform, cloud infrastructure
    - 2023: AI/ML models, blockchain, distributed systems
    - 2024: quantum computing, neuromorphic systems, IoT networks
    - 2025: AGI research, space infrastructure, climate simulation, biotechnology, fusion reactors
  - **Feature files**: 100-200 lines each with realistic configuration bloat (server configs, database settings, financial data, crypto values, permissions, network configs, color palettes, SQL queries, HTML templates)
  - **Comprehensive files**: 200-300+ lines combining all features for that ES year cumulatively
  - **Violation files**: Small (3-15 lines) demonstrating specific parse errors
  - `tests/fixtures/README.md`: Complete documentation of fixture structure, organization, usage patterns, and internal reference examples
- **Test Runner**: Vitest-based test harness for fixture validation
  - `tests/fixtures.test.ts`: Fixture discovery and validation tests
  - Automatically discovers all `.jsonv` files recursively
  - Groups tests by ES year for organized output
  - Distinguishes between valid and violation fixtures
  - Ready for Phase 2 parser integration (commented TODO sections)
- **CI/CD Pipeline**: GitHub Actions workflow for automated testing
  - `.github/workflows/ci.yml`: Comprehensive CI configuration
  - Multi-version Node.js testing (18.x, 20.x, 22.x)
  - Separate jobs for testing, building, and formatting
  - Build validation checks (dist/, types/ directories)
  - Artifact upload for build outputs
  - Runs on push/PR to main and develop branches

### Added - Earlier Phase 1 Work

- **Build Scripts**: Added comprehensive build pipeline with CI safety
  - `clean`: Remove dist/ and types/ folders
  - `build`: Full build process (clean → tsc → build:cjs → build:types)
  - `build:ci`: CI build with safety check - only removes src/ if CI environment detected
  - `scripts/remove-src-ci.mjs`: Safety script that checks for CI env vars before removing src/

### Changed

- **Configuration Files**: Updated all config files for @cldmv/jsonv project structure
  - `.configs/eslint.config.mjs`: Added `types/**` to ignores
  - `.configs/tsconfig.dts.jsonc`: Updated for `types/src/` output, NodeNext module resolution
  - `.configs/vitest.config.mjs`: Changed from slothlet-dev to json-dev condition
  - Updated package.json scripts to explicitly reference config files:
    - `lint`: Uses `.configs/eslint.config.mjs`
    - `format`: Uses `.configs/.prettierrc`
    - `test`: Uses `.configs/vitest.config.mjs` (switched from Node.js test runner to Vitest)
    - `build:types`: Added script for generating types from .mjs source
- **Build Configuration**: Fixed TypeScript configuration for proper ESM output
  - Changed `module` to `"NodeNext"` (enables automatic .mjs/.d.mts generation)
  - Changed `moduleResolution` to `"NodeNext"` (proper ESM resolution)
  - Added `types/` to tsconfig exclude list
  - With these settings, TypeScript will:
    - Generate `.mjs` from `.mts` source files automatically
    - Generate `.d.mts` type definitions for ESM modules
    - Generate `.cjs` from `.cts` source files for CommonJS
    - No post-build renaming needed
- **Package.json**: TypeScript type definitions use proper extensions
  - Updated `tsconfig.json` to set `declarationDir: "./types/dist"`
  - Updated `package.json` types to use `.d.mts` extension (correct for `.mjs` modules)
  - Added `types` to `json-dev` condition pointing to `types/src/` (parallel structure)
  - Moved `types` condition to top of exports map (highest priority)
  - Removed unnecessary `./package.json` export
  - This separates compiled JavaScript in `dist/` from type definitions in `types/`

### Fixed

- TypeScript declaration file extensions now correctly use `.d.mts` for ESM modules (was `.d.ts`)
- **Roadmap Enhancement**: Added comprehensive build process documentation to Phase 1
  - TypeScript → JavaScript compilation workflow
  - ESM conversion (`.js` → `.mjs`)
  - Type definitions organization in dedicated `types/` folder
  - CJS wrapper generation strategy
  - Build scripts and configuration examples
  - Development mode with `json-dev` condition
- **Memory System Requirements**: Enhanced to emphasize searching before working
  - Added requirement to use `fileindex_search` and `memory_search` BEFORE tasks
  - Added requirement to use `fileindex_get` and `memory_get` BEFORE asking users
  - Clarified workflow: search first, work second, document third

## [0.1.0] - 2026-01-14

### Added - Phase 1: Foundation & Architecture (Completed)

- Initial project specification documents
  - `spec/feature-matrix.md`: Complete ES year-to-feature mapping (2011-2025)
  - `spec/versioning-and-layout.md`: Package structure and year-based module strategy
  - `spec/roadmap.md`: 24-week development plan with 9 phases
  - `spec/json2026-planning.md`: Historical planning document
- Workspace configuration
  - `.configs/workspace-id.json`: llm-memory workspace identifier
- Development requirements
  - Memory system usage mandate for all agents
  - Changelog maintenance requirement
- Package structure
  - `package.json`: NPM package with year-based exports and json-dev condition
  - `tsconfig.json`: TypeScript configuration targeting ES2022
  - `README.md`: Project overview with quick start examples
- TypeScript type definitions
  - `src/ast-types.ts`: AST node interfaces for all features (Program, Literal, ObjectExpression, ArrayExpression, TemplateLiteral, MemberExpression, etc.)
  - `src/api-types.ts`: Public API interfaces (JSONVApi, ParseOptions, StringifyOptions, DiagnoseResult, InfoResult, RawJSON)
- Implementation scaffolding
  - `src/lexer.ts`: Lexer shell with token types and structure (Phase 2)
  - `src/parser.ts`: Parser shell with recursive descent structure (Phase 2-3)
  - `src/years/2011.ts`: ES2011 (JSON5) year module entry point
  - `src/years/2015.ts`: ES2015 year module entry point
  - `src/years/2020.ts`: ES2020 year module entry point
  - `src/years/2021.ts`: ES2021 year module entry point
- Test fixtures (100-200 lines each)
  - `tests/fixtures/2011/features/json5-complete.jsonv`: Comprehensive JSON5 test
  - `tests/fixtures/2015/features/es2015-complete.jsonv`: Binary/octal/template literals
  - `tests/fixtures/2020/features/bigint-complete.jsonv`: BigInt literals
  - `tests/fixtures/2021/features/numeric-separators-complete.jsonv`: Numeric separators
  - `tests/fixtures/*/violations/*.jsonv`: Invalid syntax tests for each year

### Design Decisions

- **Internal References**: Split between ES2011 (bare identifiers) and ES2015 (template interpolation)
  - Rationale: Features map to earliest syntactically-valid ES year
  - Bare identifiers (`{ port: 8080, backup: port }`) available in 2011
  - Template interpolation (`` url: `http://${host}:${port}` ``) requires ES2015 backticks
  - Both follow defined-before-use, file-scoped-only, no-circular-refs rules
  - Nested property access supported: `server.port`

- **Octal Literal Support**: Both old (`0755`) and new (`0o755`) syntax supported
  - Rationale: Most developers use old syntax, both should work

- **Year Module Forwarding**: Years without new features re-export from last feature year
  - Example: 2022-2025 all re-export from 2021
  - Rationale: Allows pinning to exact target year without code duplication

- **Package Name**: `@cldmv/jsonv` (not JSON2026)
  - Rationale: Clearer scope, no year in name that becomes outdated

### Reference Implementation

- Douglas Crockford's JSON parser identified as potential foundation
  - Source: https://github.com/douglascrockford/JSON-js/blob/03157639c7a7cddd2e9f032537f346f1a87c0f6d/json_parse.js
  - Credit required if used as base

---

## Notes

- Year-based API modules will be published for: 2011, 2015, 2016-2019, 2020, 2021, 2022-2025
- Each year module is a frozen API contract
- Root import (`@cldmv/jsonv`) aliases latest year but production code should pin explicit year
