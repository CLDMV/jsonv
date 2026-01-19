# Versioning, Exports, and Year Resolution

@cldmv/jsonv publishes frozen, year-pinned APIs aligned to ECMAScript release years. Each year is a stable contract for grammar support and behavior.

## Why pin a year

- Year modules are stable and never change behavior.
- The root import (`@cldmv/jsonv`) always aliases the latest supported year.
- Production code should pin a year to avoid unintentional grammar changes.

## Import patterns

ESM:
```js
import { parse } from "@cldmv/jsonv/2021";
```

CJS:
```js
const { parse } = require("@cldmv/jsonv/2021");
```

Root alias:
```js
import { parse } from "@cldmv/jsonv"; // latest year
```

## Year forwarding

Years without new syntax re-export the most recent feature year:

- 2012–2014 → 2011
- 2016–2019 → 2015
- 2022–2025 → 2021

## Dynamic year loading

Use the loader when the year is chosen at runtime:

```js
import { loadYear } from "@cldmv/jsonv/loader";

const jsonv = await loadYear(2023); // resolves to 2021
const value = jsonv.parse("{ value: 1_000 }");
```

## Year resolution utilities

```js
import { resolveYear, isPublishedYear, getPublishedYears } from "@cldmv/jsonv/year-resolver";

resolveYear(2024); // 2021
isPublishedYear(2021); // true
getPublishedYears(); // [2011, 2015, 2020, 2021]
```
