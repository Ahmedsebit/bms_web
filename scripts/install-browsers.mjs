import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url))
const result = spawnSync(process.execPath, [cli, 'install', 'chromium', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
