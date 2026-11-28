// Where the self-hosted fonts come from. The files stay inside the @fontsource packages in node_modules
// (pinned by package-lock.json) and are served from /fonts/..., so no request ever goes to Google Fonts.
// Only the "files" folder of each package is served, never node_modules itself.
const path = require('node:path');

const packageFiles = (name) => path.join(path.dirname(require.resolve(`${name}/package.json`)), 'files');

// URL prefix -> folder on disk
const FONT_ROUTES = {
  '/fonts/inter-tight': packageFiles('@fontsource-variable/inter-tight'),
  '/fonts/reenie-beanie': packageFiles('@fontsource/reenie-beanie'),
};

// Turns a font URL used in the style sheet (like /fonts/inter-tight/x.woff2) into its file on disk,
// or null when it is not one of ours. Used by tests to check every @font-face points at a real file.
function fontFileFor(url) {
  if (typeof url !== 'string') return null;
  for (const [prefix, dir] of Object.entries(FONT_ROUTES)) {
    if (url.startsWith(`${prefix}/`)) {
      const name = url.slice(prefix.length + 1);
      if (name === '' || name.includes('/') || name.includes('..') || name.includes('\\')) return null;
      return path.join(dir, name);
    }
  }
  return null;
}

module.exports = { FONT_ROUTES, fontFileFor };
