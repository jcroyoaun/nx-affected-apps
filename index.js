const { execSync } = require('child_process');
const path = require('path');

// Setup: Install dependencies locally
//try {
  //console.log('Installing dependencies...');
  //execSync('npm init -y && npm install @actions/core@1.10.0 @nrwl/devkit@16.9.1 nx@16.9.1 --save', { stdio: 'inherit' });
//} catch (error) {
//  console.error('Failed to install dependencies:', error);
//  process.exit(1);
//}

// Add the local node_modules to the require path
process.env.NODE_PATH = path.join(process.cwd(), 'node_modules');
require('module').Module._initPaths();

// Main logic
const core = require('@actions/core');
const { Workspaces } = require('@nrwl/devkit');

try {
  const tag = core.getInput('tag', { required: true });

  const workspace = new Workspaces(process.cwd()).readWorkspaceConfiguration();

  const projects = execSync('npx nx show projects --affected')
    .toString('utf-8')
    .trim()
    .split('\n')
    .filter((project) => !!project);

  const affected = projects.filter((project) =>
    workspace.projects[project].tags?.includes(tag)
  );

  const affectedString = affected.join(' ');

  console.log(affectedString);
  core.setOutput('affected_projects', affectedString);
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
