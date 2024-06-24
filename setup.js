const { execSync } = require('child_process');
const fs = require('fs');

try {
  // Remove existing package.json if it exists
  if (fs.existsSync('package.json')) {
    fs.unlinkSync('package.json');
  }

  // Install dependencies
  const dependencies = [
    '@actions/core@1.10.0',
    'nx@16.9.1',
    '@nrwl/devkit@16.9.1'
  ];

  dependencies.forEach(dep => {
    console.log(`Installing ${dep}...`);
    execSync(`yarn add ${dep} --dev`, { stdio: 'inherit' });
  });

  console.log('All dependencies installed successfully.');
} catch (error) {
  console.error('Error during setup:', error);
  process.exit(1);
}
