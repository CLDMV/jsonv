/**
 * Remove src/ folder in CI environments only
 *
 * This script checks for CI environment variables before removing
 * the src/ folder to prevent accidental deletion during local development.
 *
 * @cldmv/jsonv - Phase 1 Build Infrastructure
 */

import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * Check if running in a CI environment
 */
function isCI() {
	return !!(
		process.env.CI || // Generic CI flag (GitHub Actions, GitLab CI, etc.)
		process.env.CONTINUOUS_INTEGRATION ||
		process.env.GITHUB_ACTIONS ||
		process.env.GITLAB_CI ||
		process.env.CIRCLECI ||
		process.env.TRAVIS ||
		process.env.JENKINS_HOME ||
		process.env.TEAMCITY_VERSION ||
		process.env.BUILDKITE ||
		process.env.DRONE
	);
}

/**
 * Main execution
 */
async function main() {
	if (!isCI()) {
		console.error("❌ ERROR: build:ci can only be run in CI environments");
		console.error("   This prevents accidental deletion of src/ during local development.");
		console.error("   If you need to test CI build locally, set CI=true environment variable:");
		console.error("   CI=true npm run build:ci");
		process.exit(1);
	}

	console.log("✓ CI environment detected, proceeding with src/ removal...");

	if (!existsSync("src")) {
		console.log("✓ src/ folder does not exist, nothing to remove");
		process.exit(0);
	}

	try {
		await rm("src", { recursive: true, force: true });
		console.log("✓ Successfully removed src/ folder for CI build");
	} catch (error) {
		console.error("❌ Failed to remove src/ folder:", error.message);
		process.exit(1);
	}
}

main();
