import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, NG_CLI_ANALYTICS: 'false', NG_BUILD_PARALLEL_TS: 'false', NG_BUILD_MAX_WORKERS: '1' },
});
process.exit(result.status ?? 1);
