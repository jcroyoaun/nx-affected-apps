const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('Installing dependencies...');
  const actionDir = path.dirname(__filename);
  execSync(`npm install nx@16.9.1 --prefix ${actionDir}`, { stdio: 'inherit' });
  console.log('Dependencies installed successfully');
} catch (error) {
  console.error('Error installing dependencies:', error);
  process.exit(1);
}
