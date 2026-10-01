# Vendored source

- Project: https://github.com/saadk408/davinci-resolve-lua-mcp
- Commit: `a10acbc33b5fc3976832d575425c7b35ae1432af`
- Package version: `0.2.0`
- License: MIT, copyright 2026 Saad Khan (see LICENSE)
- Included: TypeScript source, Lua bridge, diagnostic script required by the upstream installer, package manifest/lock and TypeScript configuration.
- No source modifications; generated bundles, dependencies and upstream Git history are not included. Build with `npm ci` and `npm run build`.

The included `scripts/claude_diag.lua` is an upstream diagnostic with project mutations. Our doctor never invokes it. This repository's Python setup and doctor are separate code outside this directory.
