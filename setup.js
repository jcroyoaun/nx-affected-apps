const { execSync } = require('child_process');

try {
  console.log('Installing dependencies...');
  execSync('npm install @actions/core@1.10.0 @nrwl/devkit@16.9.1 nx@16.9.1', { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to install dependencies:', error);
  process.exit(1);
}


