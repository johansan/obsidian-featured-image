#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Read the TypeScript release notes file
const releaseNotesPath = path.join(__dirname, '..', 'src', 'releaseNotes.ts');
const content = fs.readFileSync(releaseNotesPath, 'utf8');

// Find the RELEASE_NOTES array declaration
const releaseNotesMatch = content.match(
    /(?:export\s+)?const\s+RELEASE_NOTES[\s\S]*?=\s*(\[[\s\S]*?\]);/
);
if (!releaseNotesMatch) {
    console.error('Could not find RELEASE_NOTES in file');
    process.exit(1);
}

// Evaluate the array in a sandbox to get actual JavaScript objects
let releases;
try {
    const sandbox = {};
    const arrayCode = `(${releaseNotesMatch[1]})`;
    releases = vm.runInNewContext(arrayCode, sandbox);
} catch (error) {
    console.error('Could not parse release notes:', error.message);
    process.exit(1);
}

if (!releases || releases.length === 0) {
    console.error('No release notes found');
    process.exit(1);
}

// Allow selecting a specific version (e.g. CI can pass the tag version)
const versionArg = process.argv.slice(2).find(arg => arg && !arg.startsWith('-'));
const normalizedVersion = versionArg ? versionArg.replace(/^v/, '') : null;

// Get the requested release, or default to the first (latest)
const release = normalizedVersion
    ? releases.find(entry => entry && entry.version === normalizedVersion)
    : releases[0];

if (!release) {
    console.error(`No release notes found for version: ${normalizedVersion}`);
    process.exit(1);
}

// Helper function to convert == to ** (GitHub doesn't render ==highlight==)
const convertMarkdown = text => text.replace(/==/g, '**');

const printSection = (title, items) => {
    if (!items || items.length === 0) return;
    console.log(`### ${title}\n`);
    items.forEach(item => console.log(`- ${convertMarkdown(item)}`));
    console.log();
};

if (release.info) {
    console.log(`${convertMarkdown(release.info)}\n`);
}

printSection('New', release.new);
printSection('Improved', release.improved);
printSection('Changed', release.changed);
printSection('Fixed', release.fixed);
