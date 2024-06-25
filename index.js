const core = require('@actions/core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Workspaces } = require('@nrwl/devkit');

console.log('Current working directory:', process.cwd());
console.log('Contents of current directory:', fs.readdirSync(process.cwd()));

try {
  const frontendTag = core.getInput('frontend_tag');
  const backendTag = core.getInput('backend_tag');
  const includeLibs = core.getBooleanInput('include_libs');
  const allProjects = core.getBooleanInput('all_projects');

  console.log('Inputs:', { frontendTag, backendTag, includeLibs, allProjects });

  const workspace = new Workspaces(process.cwd()).readWorkspaceConfiguration();
  console.log('Workspace configuration read successfully');

  const projectsOutput = execSync('npx nx show projects --affected', { encoding: 'utf-8' });
  console.log('Raw projects output:', projectsOutput);

  const projects = projectsOutput.trim().split('\n').filter(project => !!project);
  console.log('Parsed projects:', projects);

  const frontendProjects = projects.filter(project => 
    workspace.projects[project]?.tags?.includes(frontendTag)
  );
  const backendProjects = projects.filter(project => 
    workspace.projects[project]?.tags?.includes(backendTag)
  );

  console.log('Frontend projects:', frontendProjects);
  console.log('Backend projects:', backendProjects);

  let affectedProjects = [];
  if (allProjects) {
    affectedProjects = projects;
  } else {
    affectedProjects = [...frontendProjects, ...backendProjects];
    if (includeLibs) {
      const libraryProjects = projects.filter(project => 
        workspace.projects[project]?.tags?.includes('type:lib')
      );
      affectedProjects = [...affectedProjects, ...libraryProjects];
    }
  }

  console.log('Affected projects:', affectedProjects);

  const frontendString = frontendProjects.join(' ');
  const backendString = backendProjects.join(' ');
  const projectsString = affectedProjects.join(' ');

  core.setOutput('frontend_components', frontendString);
  core.setOutput('backend_components', backendString);
  core.setOutput('projects', projectsString);

  console.log('Outputs set successfully');
} catch (error) {
  console.error('Error:', error);
  core.setFailed(error.message);
}
