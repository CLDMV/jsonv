# ESLint Configuration

This project has two ESLint configurations:

## eslint.config.mjs (ESLint 8.57)
**Current default configuration**

Uses ESLint 8.57 with multiple language plugins:
- **JavaScript/TypeScript**: Core ESLint rules
- **JSON/JSONC/JSON5**: `@eslint/json` plugin
- **Markdown**: `@eslint/markdown` plugin  
- **CSS**: `@eslint/css` plugin
- **HTML**: `@html-eslint/eslint-plugin`
- **JSONV**: Custom `eslint-plugin-jsonv` (in this repo)

**Usage:**
```bash
npm run lint
```

**Note:** Requires `ESLINT_USE_FLAT_CONFIG=true` environment variable for flat config support in ESLint 8.57.

## eslint.config.v9.mjs (ESLint 9.39+)
**Future-ready configuration**

Designed for ESLint 9.39+ with native flat config support:
- **JavaScript/TypeScript**: Core ESLint rules
- **JSONV**: Custom `eslint-plugin-jsonv`

**Current Limitations:**
- `@eslint/json`, `@eslint/markdown`, `@eslint/css` are not yet released for ESLint 9
- HTML linting still works with `@html-eslint/eslint-plugin`

**Community Alternatives:**
- **JSON**: `eslint-plugin-jsonc` (supports JSON, JSONC, JSON5)
- **Markdown**: `eslint-plugin-markdown` (community version)

**Usage (when ESLint 9+ is installed):**
```bash
npx eslint --config .configs/eslint.config.v9.mjs src tests
```

## Migrating to ESLint 9

When ready to migrate:

1. Update ESLint:
   ```bash
   npm install --save-dev eslint@^9.39.0
   ```

2. Install compatible plugins:
   ```bash
   npm install --save-dev eslint-plugin-jsonc eslint-plugin-markdown @html-eslint/eslint-plugin
   ```

3. Update package.json lint script:
   ```json
   "lint": "eslint --config .configs/eslint.config.v9.mjs src tests"
   ```

4. Test the configuration:
   ```bash
   npm run lint
   ```

5. Once verified, rename:
   ```bash
   mv .configs/eslint.config.mjs .configs/eslint.config.v8.mjs
   mv .configs/eslint.config.v9.mjs .configs/eslint.config.mjs
   ```

## Configuration Details

### Ignored Patterns
Both configs ignore:
- Build outputs: `dist/`, `types/`, `build/`
- Development files: `node_modules/`, `.git/`, `.vscode/`, `.configs/`
- Temporary files: `tmp/`, `trash/`
- Minified files: `*.min.js`, `*.min.css`
- Copy files: `*copy/`, `*copy (*).*`, etc.

### JavaScript/TypeScript Rules
- **no-unused-vars**: Allows unused vars matching patterns:
  - `_` (single underscore)
  - `___*` (triple underscore prefix)
- Applies to: args, caught errors, destructured arrays, variables

### Test File Globals
Test files automatically get globals:
- Vitest: `describe`, `it`, `expect`, `test`, `vi`, `vitest`
- Jest-compatible: `beforeAll`, `afterAll`

### JSONV Plugin
Custom plugin validates `.jsonv` files using `@cldmv/jsonv` parser:
- Syntax validation for ES2011-2025 features
- Internal reference validation
- BigInt literal validation
- Template interpolation checking

See `plugins/eslint-plugin-jsonv/README.md` for details.
