# Contributing

Use Node.js 22 or newer. Install the locked development dependencies with `npm ci`. Edit `src/`, then run `npm run check`. Use `npm run package` to create a ZIP containing only the extension and its user documentation.

The JavaScript, CSS, and HTML in `outputs/` are generated. Load `outputs/x-media-viewer` into Chrome for manual testing; rebuild and reload the extension after source changes. Tests run against the generated scripts so bundling and script isolation are exercised.

Use synthetic posts and media in automated tests. Include the concrete trigger, resulting behavior, and relevant validation in a change description. Distinguish automated checks from live browser testing. Avoid including private timeline content, credentials, or browser-profile data in reports or screenshots.

If changing a release version, update both `package.json` and `src/manifest.json`, and refresh the lockfile with `npm install --package-lock-only`.
