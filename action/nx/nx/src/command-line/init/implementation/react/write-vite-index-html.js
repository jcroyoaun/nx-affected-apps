"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeViteIndexHtml = void 0;
const fs_1 = require("fs");
function writeViteIndexHtml(appName, isStandalone, isJs) {
    const indexPath = isStandalone ? 'index.html' : `apps/${appName}/index.html`;
    if ((0, fs_1.existsSync)(indexPath)) {
        (0, fs_1.copyFileSync)(indexPath, indexPath + '.old');
    }
    const indexFile = isJs ? '/src/index.jsx' : '/src/index.tsx';
    (0, fs_1.writeFileSync)(indexPath, `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + Nx</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${indexFile}"></script>
  </body>
</html>`);
}
exports.writeViteIndexHtml = writeViteIndexHtml;
