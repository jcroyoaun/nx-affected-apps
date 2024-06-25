const { execSync } = require('child_process');

try {
  console.log('Installing dependencies...');
  execSync('npm install nx@16.9.1', { stdio: 'inherit' });
  console.log('Dependencies installed successfully');
} catch (error) {
  console.error('Error installing dependencies:', error);
  process.exit(1);
}
