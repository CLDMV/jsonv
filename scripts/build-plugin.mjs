/**
 * Build script for eslint-plugin-jsonv
 * Copies built @cldmv/jsonv package to plugin's node_modules
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, cpSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const pluginDir = join(rootDir, "plugins", "eslint-plugin-jsonv");
const pluginDistDir = join(pluginDir, "dist");
const pluginNodeModules = join(pluginDir, "node_modules");
const pluginPackageDir = join(pluginNodeModules, "@cldmv", "jsonv");

console.log("\n🔌 Building ESLint plugin...\n");

// Clean and recreate plugin dist directory
if (existsSync(pluginDistDir)) {
	rmSync(pluginDistDir, { recursive: true, force: true });
}
mkdirSync(pluginDistDir, { recursive: true });

// Read the plugin source
const pluginSrc = join(pluginDir, "index.mjs");
if (!existsSync(pluginSrc)) {
	console.error("❌ Error: plugins/eslint-plugin-jsonv/index.mjs not found");
	process.exit(1);
}

const content = readFileSync(pluginSrc, "utf8");

// Write to dist as-is (uses @cldmv/jsonv import)
const distFile = join(pluginDistDir, "index.mjs");
writeFileSync(distFile, content, "utf8");
console.log(`✓ Compiled plugin → ${distFile}`);

// Create simple .d.mts file
const dtsContent = `/**
 * ESLint plugin for @cldmv/jsonv files
 */

declare const plugin: {
	meta: {
		name: string;
		version: string;
	};
	languages: {
		jsonv: any;
	};
	configs: {
		recommended: any;
	};
	rules: {};
};

export default plugin;
`;

const dtsFile = join(pluginDistDir, "index.d.mts");
writeFileSync(dtsFile, dtsContent, "utf8");
console.log(`✓ Generated types → ${dtsFile}`);

// Copy built @cldmv/jsonv package to plugin's node_modules
console.log(`\n📦 Installing @cldmv/jsonv into plugin...\n`);

// Clean old installation
if (existsSync(pluginPackageDir)) {
	rmSync(pluginPackageDir, { recursive: true, force: true });
}

// Create node_modules structure
mkdirSync(pluginPackageDir, { recursive: true });

// Copy dist/ folder
const rootDistDir = join(rootDir, "dist");
if (!existsSync(rootDistDir)) {
	console.error("❌ Error: Root dist/ folder not found. Run 'npm run build:ts' first.");
	process.exit(1);
}

cpSync(rootDistDir, join(pluginPackageDir, "dist"), { recursive: true });
console.log(`✓ Copied dist/ → ${pluginPackageDir}/dist`);

// Copy package.json
const rootPackageJson = join(rootDir, "package.json");
copyFileSync(rootPackageJson, join(pluginPackageDir, "package.json"));
console.log(`✓ Copied package.json`);

// Copy types if they exist
const rootTypesDir = join(rootDir, "types");
if (existsSync(rootTypesDir)) {
	cpSync(rootTypesDir, join(pluginPackageDir, "types"), { recursive: true });
	console.log(`✓ Copied types/`);
}

console.log("\n✅ ESLint plugin built successfully");
console.log(`   @cldmv/jsonv installed at: ${pluginPackageDir}\n`);
