const core = require('@actions/core');
const { Workspaces } = require('@nrwl/devkit');
const { execSync } = require('child_process');

try {
  const frontendTag = core.getInput('frontend_tag');
  const backendTag = core.getInput('backend_tag');
  const includeLibs = core.getBooleanInput('include_libs');
  const allProjects = core.getBooleanInput('all_projects');
  const workspaceDirectory = core.getInput('workspace_directory');

  // Install dependencies in the project's directory
  execSync('yarn add nx@16.9.1 @nrwl/devkit@16.9.1 @actions/core@1.10.0 --dev', {
    cwd: workspaceDirectory,
    stdio: 'inherit',
  });

  const workspace = new Workspaces(workspaceDirectory).readWorkspaceConfiguration();
  const projects = execSync('npx nx show projects --affected', { cwd: workspaceDirectory })
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
