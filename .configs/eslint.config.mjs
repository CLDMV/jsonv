/**
 *	@Project: @cldmv/jsonv
 *	@Filename: /.configs/eslint.config.mjs
 *	@Date: 2026-01-14 17:26:54 -08:00 (1768440414)
 *	@Author: Nate Hyson <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Hyson <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-01-14 17:35:11 -08:00 (1768440911)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import html from "@html-eslint/eslint-plugin";
import htmlParser from "@html-eslint/parser";
import { defineConfig } from "eslint/config";
import jsonv from "../plugins/eslint-plugin-jsonv/dist/index.js";

export default defineConfig([
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
	{
		files: ["**/*.{js,mjs,cjs}"],
		plugins: { js },
		extends: ["js/recommended"],
		rules: {
			"no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^(_|___.*)$",
					caughtErrorsIgnorePattern: "^(_|___.*)$",
					destructuredArrayIgnorePattern: "^(_|___.*)$",
					varsIgnorePattern: "^(_|___.*)$"
				}
			]
		}
	},
	{ files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
	{ files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
	{
		files: ["**/test/**/*test.js"],
		languageOptions: {
			globals: {
				beforeAll: true,
				afterAll: true,
				describe: true,
				it: true,
				expect: true,
				test: true
			}
		}
	},
	{ files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
	{ files: ["**/*.jsonc"], plugins: { json }, language: "json/jsonc", extends: ["json/recommended"] },
	{ files: ["**/*.json5"], plugins: { json }, language: "json/json5", extends: ["json/recommended"] },
	{ files: ["**/*.jsonv"], plugins: { jsonv }, language: "jsonv/jsonv", extends: ["jsonv/recommended"] },
	{
		files: ["**/*.md"],
		plugins: { markdown },
		language: "markdown/gfm",
		extends: ["markdown/recommended"],
		rules: {
			// Disable label reference checking for files with GitHub callouts
			// GitHub alerts like [!NOTE], [!WARNING] are valid syntax but trigger false positives
			"markdown/no-missing-label-refs": "off"
		}
	},
	{ files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
	{
		files: ["**/*.html"],
		plugins: { "@html-eslint": html },
		languageOptions: { parser: htmlParser },
		rules: {
			"@html-eslint/require-doctype": "error",
			"@html-eslint/require-lang": "error",
			"@html-eslint/require-title": "error"
		}
	}
]);
