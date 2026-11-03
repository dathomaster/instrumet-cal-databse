# PowerSync project notes (for agents & humans)
- CLI: `npx powersync@latest` (in the cloud container also export NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt)
- Config dir: `powersync/` (service.yaml, sync-config.yaml, cli.yaml)
- Org `dathomaster` 6a70cb020fc40700078edbd1, project `instrumet` 6ae9645493395a0007b938f1
- Instances: Development 6ae964554d7433c80998d2e2 = dev (linked, safe to deploy); Production 6ae96456b0047aeb6df925c3 = prod (ask first)
- Credentials live in `.env` (gitignored); template in `.env.example`
