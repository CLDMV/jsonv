/**
 *	@Project: @cldmv/jsonv
 *	@Filename: /.configs/eslint.config.v9.mjs
 *	@Date: 2026-01-16 (ESLint 9.39+ config)
 *	@Author: Nate Hyson <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *	-----
 *	ESLint 9.39+ flat config - successor to eslint.config.mjs
 */

import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import html from "@html-eslint/eslint-plugin";
import htmlParser from "@html-eslint/parser";
import tseslint from "typescript-eslint";
import jsonv from "../plugins/eslint-plugin-jsonv/dist/index.mjs";

export default [
	// Global ignores - applies to all configurations
	{
		ignores: [
			"tmp/**",
			"trash/**",
			"node_modules/**",
			"dist/**",
			"types/**",
			"build/**",
			".git/**",
			".configs/**",
			".vscode/**",
			"coverage/**",
			"*.min.js",
			"*.min.css",
			"**/package-lock.json",
			// Copy file patterns
			"*copy/",
			"*copy (*)/",
			"*copy */",
			"*copy.*",
			"*copy (*).*",
			"*copy *.*",
			// Additional copy patterns for nested directories
			"**/*copy/",
			"**/*copy (*)/",
			"**/*copy */",
			"**/*copy.*",
			"**/*copy (*).*",
			"**/*copy *.*"
		]
	},

	// JavaScript/TypeScript files
	{
		files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
		...js.configs.recommended,
		languageOptions: {
			ecmaVersion: 2025,
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.browser
			},
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2025,
				sourceType: "module"
			}
		},
		rules: {
			"no-unused-vars": "off", // Use TypeScript-specific rule instead
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					args: "none", // Don't check parameters in function signatures
					argsIgnorePattern: "^(_|___.*)$",
					caughtErrorsIgnorePattern: "^(_|___.*)$",
					destructuredArrayIgnorePattern: "^(_|___.*)$",
					varsIgnorePattern: "^(_|___.*)$",
					ignoreRestSiblings: true
				}
			]
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin
		}
	},

	// CommonJS files
	{
		files: ["**/*.cjs"],
		languageOptions: {
			sourceType: "commonjs"
		}
	},

	// Test files
	{
		files: ["**/test/**/*test.{js,mjs,ts}", "**/tests/**/*.test.{js,mjs,ts}"],
		languageOptions: {
			globals: {
				beforeAll: true,
				afterAll: true,
				describe: true,
				it: true,
				expect: true,
				test: true,
				vi: true,
				vitest: true
			}
		}
	},

	// JSON files
	{
		files: ["**/*.json"],
		plugins: {
			json
		},
		language: "json/json",
		rules: {
			...json.configs.recommended.rules
		}
	},

	// JSONC files
	{
		files: ["**/*.jsonc"],
		plugins: {
			json
		},
		language: "json/jsonc",
		rules: {
			...json.configs.recommended.rules
		}
	},

	// JSON5 files
	{
		files: ["**/*.json5"],
		plugins: {
			json
		},
		language: "json/json5",
		rules: {
			...json.configs.recommended.rules
		}
	},

	// JSONV files (custom plugin)
	// {
	// 	files: ["**/*.jsonv"],
	// 	plugins: {
	// 		jsonv
	// 	},
	// 	language: "jsonv/jsonv",
	// 	...jsonv.configs.recommended
	// },

	// Markdown files
	{
		files: ["**/*.md"],
		plugins: {
			markdown
		},
		language: "markdown/gfm",
		rules: {
			...markdown.configs.recommended.rules,
			// Disable label reference checking for files with GitHub callouts
			// GitHub alerts like [!NOTE], [!WARNING] are valid syntax but trigger false positives
			"markdown/no-missing-label-refs": "off"
		}
	},

	// CSS files
	{
		files: ["**/*.css"],
		plugins: {
			css
		},
		language: "css/css",
		rules: {
			...css.configs.recommended.rules
		}
	},

	// HTML files
	{
		files: ["**/*.html"],
		plugins: {
			"@html-eslint": html
		},
		languageOptions: {
			parser: htmlParser
		},
		rules: {
			"@html-eslint/require-doctype": "error",
			"@html-eslint/require-lang": "error",
			"@html-eslint/require-title": "error"
		}
	}
];
