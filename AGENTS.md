# Project instructions

Use plain language. Do not edit GLOBAL_AGENTS.md.

Edit extension code in `src/`, tests in `tests/`, and build tools in `scripts/`. Do not hand-edit generated files in `outputs/`. `work/` and `outputs/` are ignored local directories and must not be committed.

Keep the main-world bridge and isolated-world viewer as independent bundles of the shared media helper source. Do not introduce a cross-world global dependency.

Run `npm run check` after code changes and `npm run package` when updating the installable extension. Report automated checks separately from live Chrome verification. Chrome extension reloads require the user when computer-use policy blocks extension management controls.

Keep examples and fixtures synthetic. Keep request credentials, browser profile data, and private timeline captures out of Git. Do not change GitHub visibility or choose a public license without a user request.
