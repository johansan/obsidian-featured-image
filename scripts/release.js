#!/usr/bin/env node

/*
 * Obsidian Plugin Release Script
 * ==============================
 * This script is checked into git
 *
 * This script automates the release process for Obsidian plugins by:
 * - Incrementing version numbers in manifest.json, package.json, and versions.json
 * - Committing the changes
 * - Creating a git tag
 * - Pushing everything to trigger GitHub Actions
 *
 * Usage:
 *   node release.js                    # Interactive mode (choose between patch/minor/major)
 *   node release.js patch              # Direct patch release (no interaction)
 *   node release.js minor              # Direct minor release (no interaction)
 *   node release.js major              # Direct major release (no interaction)
 *   node release.js patch --dry-run    # Preview changes without executing
 *   node release.js --dry-run          # Interactive mode with dry run
 *
 * Version numbering follows Semantic Versioning (semver):
 *   MAJOR.MINOR.PATCH (e.g., 1.2.3)
 *
 *   - PATCH (x.x.X): Bug fixes, small tweaks, documentation updates
 *     Example: 1.2.3 → 1.2.4
 *     Use when: You fixed a bug, updated docs, or made tiny improvements
 *
 *   - MINOR (x.X.x): New features, backwards-compatible changes
 *     Example: 1.2.3 → 1.3.0 (patch resets to 0)
 *     Use when: You added new commands, settings, or features that don't break existing functionality
 *
 *   - MAJOR (X.x.x): Breaking changes, major rewrites, incompatible API changes
 *     Example: 1.2.3 → 2.0.0 (minor and patch reset to 0)
 *     Use when: You changed how settings work, removed features, or made changes that require users to reconfigure
 *
 * Make sure you have committed all your changes before running this script!
 */

const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const path = require('path');
const readline = require('readline');
const os = require('os');

// ============================================================================
// CONFIGURATION
// ============================================================================

const projectRoot = path.join(__dirname, '..');
const validReleaseTypes = ['patch', 'minor', 'major'];
const lockFilePath = path.join(projectRoot, '.release.lock');

// ============================================================================
// GLOBAL STATE
// ============================================================================

let needsCleanup = false;
let isDryRun = false;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Helper function to safely parse JSON files
function parseJsonFile(filePath, filename) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new Error(`Failed to parse ${filename}: ${error.message}`);
    }
}

// Helper function to write JSON files with consistent formatting
function writeJsonFile(filePath, data) {
    if (isDryRun) {
        console.log(`[DRY RUN] Would write to ${path.basename(filePath)}`);
        return;
    }
    // Write to temp file first for atomic operation
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tempPath, filePath);
}

// Helper to execute git commands with array syntax (safe from injection)
function gitExecArray(args, options = {}) {
    if (isDryRun && ['add', 'commit', 'tag', 'push'].includes(args[0])) {
        console.log(`[DRY RUN] Would run: git ${args.join(' ')}`);
        return Buffer.from('');
    }
    return execFileSync('git', args, { cwd: projectRoot, ...options });
}

// Helper to execute git commands that return strings
function gitExecString(args, options = {}) {
    const result = gitExecArray(args, { encoding: 'utf8', ...options }).trim();
    // Validate output isn't suspiciously long
    if (result.length > 10000) {
        throw new Error('Unexpected git output length');
    }
    return result;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

function checkGitAvailable() {
    try {
        if (os.platform() === 'win32') {
            execSync('git --version', { stdio: 'ignore', shell: true });
        } else {
            execSync('git --version', { stdio: 'ignore' });
        }
    } catch (e) {
        console.error('❌ git is not installed or not in PATH');
        console.error('   Please install git first');
        process.exit(1);
    }
}

function checkNpmAvailable() {
    try {
        if (os.platform() === 'win32') {
            execSync('npm --version', { stdio: 'ignore', shell: true });
        } else {
            execSync('npm --version', { stdio: 'ignore' });
        }
    } catch (e) {
        console.error('❌ npm is not installed or not in PATH');
        console.error('   Please install Node.js and npm first');
        process.exit(1);
    }
}

function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
        console.error('❌ manifest.json is not a valid object');
        process.exit(1);
    }

    if (!manifest.version) {
        console.error('❌ manifest.json is missing required field: version');
        process.exit(1);
    }

    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        console.error(`❌ Invalid version format in manifest.json: ${manifest.version}`);
        console.error('   Version must be in format: MAJOR.MINOR.PATCH (e.g., 1.2.3)');
        process.exit(1);
    }

    if (!manifest.minAppVersion || !/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
        console.error('❌ manifest.json has invalid or missing minAppVersion');
        console.error('   minAppVersion must be in format: MAJOR.MINOR.PATCH (e.g., 0.15.0)');
        process.exit(1);
    }
}

function validateVersionNumbers(versionParts) {
    if (versionParts.some(isNaN) || versionParts.some(n => n < 0 || n > 9999)) {
        console.error('❌ Invalid version numbers (must be 0-9999)');
        process.exit(1);
    }
}

function checkVersionOverflow(major, minor, patch, releaseType) {
    if (releaseType === 'patch' && patch >= 9999) {
        console.error('❌ Patch version would overflow (max 9999)');
        console.error('   Consider a minor or major release instead');
        process.exit(1);
    }
    if (releaseType === 'minor' && minor >= 9999) {
        console.error('❌ Minor version would overflow (max 9999)');
        console.error('   Consider a major release instead');
        process.exit(1);
    }
    if (releaseType === 'major' && major >= 9999) {
        console.error('❌ Major version would overflow (max 9999)');
        console.error('   This project has reached maximum version!');
        process.exit(1);
    }
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

function preReleaseChecks() {
    try {
        // Check if we're in a git repository
        try {
            gitExecArray(['rev-parse', '--git-dir'], { stdio: 'pipe' });
        } catch (e) {
            console.error('❌ Not in a git repository');
            console.error('   Initialize a git repository first with: git init');
            process.exit(1);
        }

        // Check for uncommitted changes FIRST
        const status = gitExecString(['status', '--porcelain']);
        if (status) {
            console.error('❌ You have uncommitted changes:');
            console.error(
                status
                    .split('\n')
                    .map(line => '   ' + line)
                    .join('\n')
            );
            console.error('\n   Please commit or stash all changes before releasing.');
            console.error('   Run: git status');
            process.exit(1);
        }

        // Check current branch
        const currentBranch = gitExecString(['rev-parse', '--abbrev-ref', 'HEAD']);
        if (currentBranch !== 'master' && currentBranch !== 'main') {
            console.error(`❌ You must be on the 'master' or 'main' branch to create a release.`);
            console.error(`   Current branch: ${currentBranch}`);
            console.error(`   Run: git checkout master`);
            process.exit(1);
        }

        // Check if remote exists
        try {
            gitExecArray(['remote', 'get-url', 'origin'], { stdio: 'pipe' });
        } catch (e) {
            console.error('❌ No remote named "origin" found');
            console.error('   Add a remote with: git remote add origin <url>');
            process.exit(1);
        }

        // Check if branch is up to date with remote
        try {
            gitExecArray(['fetch'], { stdio: 'pipe' });
        } catch (e) {
            console.error('❌ Failed to fetch from remote:', e.message);
            process.exit(1);
        }

        const localCommit = gitExecString(['rev-parse', 'HEAD']);
        let remoteCommit;
        try {
            remoteCommit = gitExecString(['rev-parse', `origin/${currentBranch}`]);
        } catch (e) {
            console.error(`❌ Cannot find remote branch origin/${currentBranch}`);
            console.error(`   Make sure you have pushed the ${currentBranch} branch at least once`);
            process.exit(1);
        }

        if (localCommit !== remoteCommit) {
            console.error(`❌ Your local branch is not in sync with origin/${currentBranch}`);
            console.error(`   Run: git pull origin ${currentBranch}`);
            process.exit(1);
        }

        console.log('✓ Git repository is clean and ready');
        console.log(`✓ On ${currentBranch} branch and in sync with remote`);
    } catch (error) {
        console.error('❌ Pre-release checks failed:', error.message);
        process.exit(1);
    }
}

function checkExistingTag(version) {
    try {
        // Check if tag already exists locally
        const localTags = gitExecString(['tag', '-l', version]);
        if (localTags) {
            console.error(`❌ Tag ${version} already exists locally`);
            process.exit(1);
        }

        // Check remote tags
        try {
            gitExecArray(['fetch', '--tags'], { stdio: 'pipe' });
        } catch (e) {
            console.error('⚠️  Warning: Could not fetch tags:', e.message);
        }

        const remoteTags = gitExecString(['ls-remote', '--tags', 'origin']);
        if (remoteTags.includes(`refs/tags/${version}`)) {
            console.error(`❌ Tag ${version} already exists on remote`);
            console.error('   This version has already been released');
            process.exit(1);
        }

        console.log(`✓ Tag ${version} is available`);
    } catch (error) {
        console.error('❌ Failed to check existing tags:', error.message);
        process.exit(1);
    }
}

// ============================================================================
// BUILD OPERATIONS
// ============================================================================

function verifyBuild() {
    console.log('\n🔨 Running build to verify project integrity...');

    try {
        // Check if package.json exists
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            console.error('❌ No package.json found');
            console.error('   Cannot run build without package.json');
            process.exit(1);
        }

        // Check if build script exists
        const packageJson = parseJsonFile(packageJsonPath, 'package.json');
        if (!packageJson.scripts || !packageJson.scripts.build) {
            console.error('❌ No build script found in package.json');
            console.error('   Add a "build" script to package.json');
            process.exit(1);
        }

        // Check if npm is available
        checkNpmAvailable();

        // Run the build (Windows compatibility)
        if (os.platform() === 'win32') {
            execSync('npm.cmd run build', { stdio: 'inherit', cwd: projectRoot, shell: true });
        } else {
            execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });
        }

        // Verify build output exists
        const expectedFiles = ['main.js', 'manifest.json', 'styles.css'];
        const missingFiles = expectedFiles.filter(file => !fs.existsSync(path.join(projectRoot, file)));

        if (missingFiles.length > 0) {
            console.error('❌ Build failed - missing expected files:', missingFiles.join(', '));
            process.exit(1);
        }

        console.log('✓ Build completed successfully\n');
    } catch (error) {
        console.error('❌ Build failed:', error.message);
        console.error('   Fix build errors before releasing');
        process.exit(1);
    }
}

// ============================================================================
// PRE-FLIGHT VALIDATIONS
// ============================================================================

function validateReleaseReadiness(manifest, currentVersion) {
    console.log('🔍 Validating release readiness...\n');

    // Check package.json version matches manifest.json
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = parseJsonFile(packageJsonPath, 'package.json');
        if (packageJson.version !== currentVersion) {
            console.error('❌ Version mismatch between manifest.json and package.json');
            console.error(`   manifest.json: ${currentVersion}`);
            console.error(`   package.json:  ${packageJson.version}`);
            console.error('   Align versions before releasing');
            process.exit(1);
        }
        console.log('✓ package.json version matches manifest.json');
    }

    // Check required files exist
    const requiredFiles = ['manifest.json', 'main.js', 'styles.css'];
    const missingRequiredFiles = requiredFiles.filter(file => !fs.existsSync(path.join(projectRoot, file)));

    if (missingRequiredFiles.length > 0) {
        console.error('❌ Required files missing:');
        missingRequiredFiles.forEach(file => console.error(`   - ${file}`));
        console.error('   Run build before releasing');
        process.exit(1);
    }
    console.log('✓ All required files exist');

    // Check GitHub Actions workflow exists
    const workflowPath = path.join(projectRoot, '.github', 'workflows', 'release.yml');
    if (!fs.existsSync(workflowPath)) {
        console.error('⚠️  Warning: GitHub Actions release workflow not found');
        console.error('   Expected: .github/workflows/release.yml');
        console.error('   Releases may need to be created manually');
    } else {
        console.log('✓ GitHub Actions workflow found');
    }

    // Validate manifest has required Obsidian fields
    const requiredManifestFields = ['id', 'name', 'version', 'minAppVersion', 'description', 'author'];
    const missingFields = requiredManifestFields.filter(field => !manifest[field]);

    if (missingFields.length > 0) {
        console.error('❌ manifest.json missing required fields:');
        missingFields.forEach(field => console.error(`   - ${field}`));
        process.exit(1);
    }
    console.log('✓ manifest.json has all required fields');

    console.log('\n✓ All pre-flight checks passed\n');
}

// ============================================================================
// RELEASE OPERATIONS
// ============================================================================

function performRelease(releaseType, manifest, currentVersion, newVersion) {
    // Run all validations first
    validateReleaseReadiness(manifest, currentVersion);
    checkVersionOverflow(...currentVersion.split('.').map(Number), releaseType);
    preReleaseChecks();
    checkExistingTag(newVersion);
    verifyBuild();

    // Get current branch for commit/push operations
    const currentBranch = gitExecString(['rev-parse', '--abbrev-ref', 'HEAD']);

    // Create backups of files we're about to modify
    const filesToBackup = ['manifest.json', 'package.json', 'versions.json'];
    const backups = {};
    let currentCommit = null;

    try {
        // Get current commit for potential rollback
        currentCommit = gitExecString(['rev-parse', 'HEAD']);
    } catch (e) {
        console.error('❌ Failed to get current commit:', e.message);
        process.exit(1);
    }

    for (const file of filesToBackup) {
        const filePath = path.join(projectRoot, file);
        if (fs.existsSync(filePath)) {
            try {
                backups[file] = fs.readFileSync(filePath, 'utf8');
            } catch (error) {
                console.error(`⚠️  Warning: Could not backup ${file}: ${error.message}`);
            }
        }
    }

    // Function to restore files in case of error
    const rollback = message => {
        console.error('\n🔄 Rolling back changes...');

        // Restore files
        Object.entries(backups).forEach(([file, content]) => {
            const filePath = path.join(projectRoot, file);
            try {
                fs.writeFileSync(filePath, content);
                console.error(`   ✓ Restored ${file}`);
            } catch (e) {
                console.error(`   ⚠️  Failed to restore ${file}: ${e.message}`);
            }
        });

        // Try to reset git if we made commits
        if (currentCommit) {
            try {
                const headCommit = gitExecString(['rev-parse', 'HEAD']);
                if (headCommit !== currentCommit) {
                    console.error('   Resetting git to previous commit...');
                    gitExecArray(['reset', '--hard', currentCommit]);
                    console.error('   ✓ Git reset complete');
                }
            } catch (e) {
                console.error('   ⚠️  Could not reset git:', e.message);
                console.error('   Run: git reset --hard ' + currentCommit);
            }
        }

        if (message) console.error(`\n❌ ${message}`);
        process.exit(1);
    };

    console.log(`\nBumping version from ${currentVersion} to ${newVersion}\n`);
    needsCleanup = true;

    try {
        // Update manifest.json
        const manifestPath = path.join(projectRoot, 'manifest.json');
        const updatedManifest = { ...manifest, version: newVersion };
        writeJsonFile(manifestPath, updatedManifest);
        console.log('✓ Updated manifest.json');

        // Update package.json if it exists
        const packagePath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(packagePath)) {
            let packageJson;
            try {
                packageJson = parseJsonFile(packagePath, 'package.json');
            } catch (e) {
                rollback(e.message);
            }
            if (!packageJson || typeof packageJson !== 'object') {
                rollback('package.json is not a valid object');
            }
            packageJson.version = newVersion;
            writeJsonFile(packagePath, packageJson);
            console.log('✓ Updated package.json');
        }

        // Update versions.json
        const versionsPath = path.join(projectRoot, 'versions.json');
        let versionsJson = {};
        if (fs.existsSync(versionsPath)) {
            try {
                versionsJson = parseJsonFile(versionsPath, 'versions.json');
            } catch (e) {
                rollback(e.message);
            }
        }
        // Add new version with minimum required Obsidian version from original manifest
        versionsJson[newVersion] = manifest.minAppVersion;
        writeJsonFile(versionsPath, versionsJson);
        console.log('✓ Updated versions.json');
    } catch (error) {
        rollback(`Failed to update version files: ${error.message}`);
    }

    // Git operations
    try {
        // Add only files that exist
        const filesToAdd = ['manifest.json', 'package.json', 'versions.json'].filter(file => fs.existsSync(path.join(projectRoot, file)));

        // Use array syntax to avoid shell injection
        gitExecArray(['add', ...filesToAdd], { stdio: 'inherit' });

        // Commit changes
        gitExecArray(['commit', '-m', `Bump version to ${newVersion}`], { stdio: 'inherit' });
        console.log('✓ Committed version changes');

        // Create annotated tag with atomic operation
        try {
            gitExecArray(['tag', '-a', newVersion, '-m', `Release ${newVersion}`], { stdio: 'inherit' });
            console.log(`✓ Created tag ${newVersion}`);
        } catch (e) {
            // If tag creation fails, we've already committed, so note this in error
            console.error('\n⚠️  Commit succeeded but tag creation failed.');
            console.error('   The version bump has been committed.');
            rollback(`Tag creation failed: ${e.message}`);
        }

        // Push commits and the new tag
        gitExecArray(['push'], { stdio: 'inherit' });
        gitExecArray(['push', 'origin', `refs/tags/${newVersion}`], { stdio: 'inherit' });
        console.log('✓ Pushed to remote');

        needsCleanup = false;

        if (isDryRun) {
            console.log(`\n🔍 DRY RUN COMPLETE - Version ${newVersion} would be released`);
        } else {
            console.log(`\n🎉 Successfully released version ${newVersion}`);
            console.log('GitHub Actions will now create the release draft.');
            console.log('\nNext steps:');
            console.log('1. Wait for GitHub Actions to complete');
            console.log('2. Go to GitHub releases page');
            console.log('3. Add release notes');
            console.log('4. Publish the release\n');
        }
    } catch (error) {
        // If git operations fail, rollback file changes
        console.error('\n⚠️  Note: Git operations may have partially completed.');
        console.error('   Check git status and tags before retrying.');
        rollback(`Git operations failed: ${error.message}`);
    }
}

// ============================================================================
// USER INTERFACE
// ============================================================================

function showInteractivePrompt(currentVersion, versions) {
    console.log(`\nCurrent version: ${currentVersion}\n`);
    console.log('Select release type:');
    console.log(`  1) Patch (${currentVersion} → ${versions.patch}) [default]`);
    console.log(`  2) Minor (${currentVersion} → ${versions.minor})`);
    console.log(`  3) Major (${currentVersion} → ${versions.major})`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(`\nEnter choice [1]: `, answer => {
        rl.close();

        // Use default if no answer provided
        const choice = answer.trim() || '1';

        let releaseType;
        switch (choice) {
            case '1':
                releaseType = 'patch';
                break;
            case '2':
                releaseType = 'minor';
                break;
            case '3':
                releaseType = 'major';
                break;
            default:
                console.error('❌ Invalid choice');
                process.exit(1);
        }

        performRelease(releaseType, manifest, currentVersion, versions[releaseType]);
    });
}

// ============================================================================
// LOCK FILE MANAGEMENT
// ============================================================================

function acquireLock() {
    if (isDryRun) return;

    try {
        if (fs.existsSync(lockFilePath)) {
            const pid = fs.readFileSync(lockFilePath, 'utf8').trim();

            // Check if process is still running
            try {
                // This will throw if process doesn't exist
                // Note: On Windows, this might not work reliably for other users' processes
                process.kill(parseInt(pid), 0);
                console.error('❌ Another release process is already running (PID: ' + pid + ')');
                console.error('   If this is incorrect, delete ' + path.relative(process.cwd(), lockFilePath));
                process.exit(1);
            } catch (e) {
                // Process not running, remove stale lock
                console.log('⚠️  Removing stale lock file');
                fs.unlinkSync(lockFilePath);
            }
        }

        fs.writeFileSync(lockFilePath, process.pid.toString());
    } catch (error) {
        console.error('❌ Failed to acquire lock:', error.message);
        process.exit(1);
    }
}

function releaseLock() {
    if (isDryRun) return;

    try {
        if (fs.existsSync(lockFilePath)) {
            fs.unlinkSync(lockFilePath);
        }
    } catch (error) {
        console.error('⚠️  Failed to release lock:', error.message);
    }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

// Setup cleanup handler
process.on('SIGINT', () => {
    if (needsCleanup) {
        console.log('\n\n⚠️  Release interrupted!');
        console.log('   Check git status before retrying.');
    }
    releaseLock();
    process.exit(1);
});

process.on('exit', () => {
    releaseLock();
});

// Check prerequisites
checkGitAvailable();

// Acquire lock before any operations
acquireLock();

// Parse command line arguments
const args = process.argv.slice(2);
let releaseTypeArg = null;

// Check for --dry-run flag
if (args.includes('--dry-run')) {
    isDryRun = true;
    console.log('🔍 Running in DRY RUN mode - no changes will be made\n');
    // Remove --dry-run from args
    const dryRunIndex = args.indexOf('--dry-run');
    args.splice(dryRunIndex, 1);
}

// Get release type from remaining args
if (args.length > 0) {
    releaseTypeArg = args[0];
}

const hasValidArg = releaseTypeArg && validReleaseTypes.includes(releaseTypeArg);

if (releaseTypeArg && !hasValidArg) {
    console.error(`❌ Invalid release type: ${releaseTypeArg}`);
    console.error('   Use one of: patch, minor, major');
    console.error('\n   Usage: node release.js [patch|minor|major] [--dry-run]');
    process.exit(1);
}

// Read and validate manifest
const manifestPath = path.join(projectRoot, 'manifest.json');
let manifest, currentVersion;

try {
    manifest = parseJsonFile(manifestPath, 'manifest.json');
    currentVersion = manifest.version;
} catch (error) {
    console.error('❌ Failed to read manifest.json');
    console.error(`   ${error.message}`);
    console.error('   Make sure you are running this script from the project directory');
    process.exit(1);
}

validateManifest(manifest);

// Parse and validate version numbers
const versionParts = currentVersion.split('.').map(Number);
validateVersionNumbers(versionParts);

const [major, minor, patch] = versionParts;

// Calculate new versions
const versions = {
    patch: `${major}.${minor}.${patch + 1}`,
    minor: `${major}.${minor + 1}.0`,
    major: `${major + 1}.0.0`
};

// Execute release
if (hasValidArg) {
    // Direct release mode
    performRelease(releaseTypeArg, manifest, currentVersion, versions[releaseTypeArg]);
} else {
    // Interactive mode
    showInteractivePrompt(currentVersion, versions);
}
