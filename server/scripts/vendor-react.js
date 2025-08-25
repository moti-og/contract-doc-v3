// Copies React and ReactDOM UMD builds from installed packages into server/public/vendor/react
// Run with: npm run vendor:react

const fs = require('fs');
const path = require('path');

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('Copied', src, '->', dest);
}

function main() {
  try {
    const root = path.resolve(__dirname, '..');
    const reactUmd = path.join(root, 'node_modules', 'react', 'umd', 'react.production.min.js');
    const domUmd = path.join(root, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js');
    const outDir = path.join(root, 'public', 'vendor', 'react');
    copy(reactUmd, path.join(outDir, 'react.production.min.js'));
    copy(domUmd, path.join(outDir, 'react-dom.production.min.js'));
    console.log('Done. Restart servers to load real React UMDs.');
  } catch (e) {
    console.error('vendor-react failed', e);
    process.exit(1);
  }
}

main();


