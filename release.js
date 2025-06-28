#!/usr/bin/env node

/*
 * Obsidian Plugin Release Script
 * ==============================
 * 
 * This script automates the release process for Obsidian plugins by:
 * - Incrementing version numbers in manifest.json, package.json, and versions.json
 * - Committing the changes
 * - Creating a git tag
 * - Pushing everything to trigger GitHub Actions
 * 
 * Usage:
 *   node release.js          # Interactive mode (choose between patch/minor/major)
 *   node release.js patch    # Direct patch release (no interaction)
 *   node release.js minor    # Direct minor release (no interaction)
 *   node release.js major    # Direct major release (no interaction)
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
const { execSync } = require('child_process');
const path = require('path');

// Get the release type from command line argument
const cliArg = process.argv[2];
const validReleaseTypes = ['patch', 'minor', 'major'];

// Check if we have a valid release type argument
const hasValidArg = cliArg && validReleaseTypes.includes(cliArg);

// If argument provided but invalid, show error
if (cliArg && !hasValidArg) {
    console.error(`Invalid release type: ${cliArg}`);
    console.error('Use one of: patch, minor, major');
    process.exit(1);
}

// Read current version from manifest.json
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const currentVersion = manifest.version;

// Parse version parts
const versionParts = currentVersion.split('.').map(Number);
let [major, minor, patch] = versionParts;

// Calculate what each version would be
const versions = {
    patch: `${major}.${minor}.${patch + 1}`,
    minor: `${major}.${minor + 1}.0`,
    major: `${major + 1}.0.0`
};

// Function to perform the release
function performRelease(releaseType) {
    const newVersion = versions[releaseType];
    console.log(`\nBumping version from ${currentVersion} to ${newVersion}\n`);
    
    // Update manifest.json
    manifest.version = newVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
    console.log('✓ Updated manifest.json');
    
    // Update package.json if it exists
    const packagePath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        packageJson.version = newVersion;
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, '\t') + '\n');
        console.log('✓ Updated package.json');
    }
    
    // Update versions.json
    const versionsPath = path.join(__dirname, 'versions.json');
    let versionsJson = {};
    if (fs.existsSync(versionsPath)) {
        versionsJson = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
    }
    // Add new version with minimum required Obsidian version from manifest
    versionsJson[newVersion] = manifest.minAppVersion;
    fs.writeFileSync(versionsPath, JSON.stringify(versionsJson, null, '\t') + '\n');
    console.log('✓ Updated versions.json');
    
    // Git operations
    try {
        // Check for uncommitted changes (excluding the files we just modified)
        try {
            execSync('git diff --exit-code --quiet -- . ":(exclude)manifest.json" ":(exclude)package.json" ":(exclude)versions.json"');
        } catch (e) {
            console.error('\n⚠️  Warning: You have uncommitted changes. Consider committing them first.');
            console.log('   Proceeding with release anyway...\n');
        }
        
        // Stage all changed files
        execSync('git add manifest.json package.json versions.json', { stdio: 'inherit' });
        
        // Commit changes
        execSync(`git commit -m "Bump version to ${newVersion}"`, { stdio: 'inherit' });
        console.log('✓ Committed version changes');
        
        // Create and push tag
        execSync(`git tag -a ${newVersion} -m "Release ${newVersion}"`, { stdio: 'inherit' });
        console.log(`✓ Created tag ${newVersion}`);
        
        // Push commits and tags
        execSync('git push', { stdio: 'inherit' });
        execSync('git push --tags', { stdio: 'inherit' });
        console.log('✓ Pushed to remote');
        
        console.log(`\n🎉 Successfully released version ${newVersion}`);
        console.log('GitHub Actions will now create the release draft.');
        console.log('\nNext steps:');
        console.log('1. Wait for GitHub Actions to complete');
        console.log('2. Go to GitHub releases page');
        console.log('3. Add release notes');
        console.log('4. Publish the release\n');
        
    } catch (error) {
        console.error('\n❌ Git operations failed:', error.message);
        console.error('You may need to resolve conflicts or commit pending changes first.');
        process.exit(1);
    }
}

// If we have a valid argument, skip interactive mode
if (hasValidArg) {
    performRelease(cliArg);
} else {
    // Interactive mode
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const defaultReleaseType = 'patch';
    
    console.log(`\nCurrent version: ${currentVersion}\n`);
    console.log('Select release type:');
    console.log(`  1) Patch (${currentVersion} → ${versions.patch}) [default]`);
    console.log(`  2) Minor (${currentVersion} → ${versions.minor})`);
    console.log(`  3) Major (${currentVersion} → ${versions.major})`);
    
    rl.question(`\nEnter choice [1]: `, (answer) => {
        rl.close();
        
        // Use default if no answer provided
        const choice = answer.trim() || '1';
        
        let releaseType;
        switch(choice) {
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
                console.error('Invalid choice');
                process.exit(1);
        }
        
        performRelease(releaseType);
    });
}