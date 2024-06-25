const core = require('@actions/core');
const { execSync } = require('child_process');
const fs = require('fs');

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
  execSync('yarn add @nrwl/devkit@16.9.1 --dev', { stdio: 'inherit' });
  execSync('yarn add @actions/core@1.10.0 --dev', { stdio: 'inherit' });

  console.log('Dependencies installed successfully.');
} catch (error) {
  core.setFailed(`Action failed with error: ${error}`);
}
