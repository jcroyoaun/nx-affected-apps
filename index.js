const core = require('@actions/core');
const { Workspaces } = require('@nrwl/devkit');
const { execSync } = require('child_process');
const { join } = require('path');

const [tag = null] = process.argv.slice(2);

if (!tag) {
  console.error(`Missing tag`);
  process.exit(1);
}

const workspace = new Workspaces(
  join(__dirname, '..')
).readWorkspaceConfiguration();

const projects = execSync('npx nx show projects --affected') 
  .toString('utf-8')
  .trim()
  .split('\n')
  .filter((project) => !!project);

const affected = projects.filter((project) =>
  workspace.projects[project].tags?.includes(tag)
);

const affectedString = `${affected.join(' ')}`;

console.log(affectedString);
