const core = require('@actions/core');
const { Workspaces } = require('@nrwl/devkit');
const { execSync } = require('child_process');
const { join } = require('path');
const nx = require('nx');

try {
  const tag = core.getInput('tag', { required: true });

  const workspace = new Workspaces(
    join(process.cwd(), '..')
  ).readWorkspaceConfiguration();

  const projects = execSync('npx nx show projects --affected')
    .toString('utf-8')
    .trim()
    .split('\n')
    .filter((project) => !!project);

  const affected = projects.filter((project) =>
    workspace.projects[project].tags?.includes(tag)
  );

  const affectedString = affected.join(' ');

  core.setOutput('affected_projects', affectedString);
} catch (error) {
  core.setFailed(error.message);
}
