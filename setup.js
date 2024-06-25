const core = require('@actions/core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Workspaces } = require('@nrwl/devkit');

function setup() {
  try {
    console.log('Starting dependency installation...');

    // Remove package.json if it exists
    if (fs.existsSync('package.json')) {
      console.log('Removing existing package.json...');
      fs.unlinkSync('package.json');
    }

    // Install dependencies
    console.log('Installing dependencies...');
    execSync('yarn add nx@16.9.1 --dev', { stdio: 'inherit' });

    console.log('Dependencies installed successfully.');

    // Add sleep command
    console.log('Sleeping for 5 minutes to allow examination...');
    execSync('sleep 300', { stdio: 'inherit' });
    console.log('Sleep finished.');

  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

// Call the setup function
setup();
