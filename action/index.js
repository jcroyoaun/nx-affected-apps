/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 894:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 647:
/***/ ((module) => {

module.exports = eval("require")("@nrwl/devkit");


/***/ }),

/***/ 81:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(894);
const { Workspaces } = __nccwpck_require__(647);
const { execSync } = __nccwpck_require__(81);
const { join } = __nccwpck_require__(17);

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

})();

module.exports = __webpack_exports__;
/******/ })()
;