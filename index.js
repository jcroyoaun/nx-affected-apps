const { execSync } = require('child_process');

// Setup: Install dependencies
try {
  console.log('Installing dependencies...');
  execSync('npm install @actions/core@1.10.0 @nrwl/devkit@16.9.1 nx@16.9.1', { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to install dependencies:', error);
  process.exit(1);
}

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
  core.setFailed(error.message);
}
