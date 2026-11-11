# theia_frontend
## Paths to the workcell modules

The pages read the configuration of `robot_app`, `vision_app` and `ee_app` from disk. All
paths are resolved in [lib/server/workcellPaths.ts](lib/server/workcellPaths.ts); nothing is
hardcoded in routes or pages.

- **Frontend inside the workspace** (Jetson dev `/home/ev3d/Workcell_Stack-ws`, production
  `/home/theia/Workcell_Stack-ws`): no configuration, the workspace is the parent folder.
- **Any other layout** (e.g. Windows clones with other folder names): copy
  [.env.example](.env.example) to `.env.local` and set `WORKCELL_ROOT`, a per-module
  `*_APP_DIR`, or a single folder. `.env.local` is ignored by git.

`GET /api/workcell-paths` lists the paths the running server resolved.
