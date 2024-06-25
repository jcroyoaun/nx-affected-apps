const { execSync } = require('child_process');
const path = require('path');

// Add the local node_modules to the require path
process.env.NODE_PATH = path.join(process.cwd(), 'node_modules');
require('module').Module._initPaths();

// Main logic
const core = require('@actions/core');
const { Workspaces } = require('@nrwl/devkit');

try {
  const frontendTag = core.getInput('frontend_tag');
  const backendTag = core.getInput('backend_tag');
  const includeLibs = core.getBooleanInput('include_libs');
  const allProjects = core.getBooleanInput('all_projects');

  const workspace = new Workspaces(process.cwd()).readWorkspaceConfiguration();
  const projects = execSync('npx nx show projects --affected')
    .toString('utf-8')
    .trim()
    .split('\n')
    .filter((project) => !!project);

  const frontendProjects = projects.filter((project) =>
    workspace.projects[project].tags?.includes(frontendTag)
  );
  const backendProjects = projects.filter((project) =>
    workspace.projects[project].tags?.includes(backendTag)
  );

  let affectedProjects = [];
  if (allProjects) {
    affectedProjects = projects;
  } else {
    affectedProjects = [...frontendProjects, ...backendProjects];
    if (includeLibs) {
      const libraryProjects = projects.filter((project) =>
        workspace.projects[project].tags?.includes('type:lib')
      );
      affectedProjects = [...affectedProjects, ...libraryProjects];
    }
  }

  const frontendString = frontendProjects.join(' ');
  const backendString = backendProjects.join(' ');
  const projectsString = affectedProjects.join(' ');

  core.setOutput('frontend_components', frontendString);
  core.setOutput('backend_components', backendString);
  core.setOutput('projects', projectsString);
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
