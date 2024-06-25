const core = require('@actions/core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Workspaces } = require('@nrwl/devkit');

function setup() {
  try {
    console.log('Starting dependency installation...');

    // Remove package.json if it exists
    if (fs.existsSync('package.json')) {
      console.log('Removing existing package.json...');
      fs.unlinkSync('package.json');
    }

    // Install dependencies
    console.log('Installing dependencies...');
    execSync('yarn add nx@16.9.1 --dev', { stdio: 'inherit' });
    execSync('yarn add @nrwl/devkit@16.9.1 --dev', { stdio: 'inherit' });
    execSync('yarn add @actions/core@1.10.0 --dev', { stdio: 'inherit' });

    console.log('Dependencies installed successfully.');

    // Add sleep command
    console.log('Sleeping for 5 minutes to allow examination...');
    execSync('sleep 300', { stdio: 'inherit' });
    console.log('Sleep finished.');

  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

// Call the setup function
setup();

// Set up Node path
process.env.NODE_PATH = path.join(process.cwd(), 'node_modules');
require('module').Module._initPaths();

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
