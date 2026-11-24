import { build, context } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { createServer, request } from 'node:http'

const { values } = parseArgs({
  options: {
    serve: { type: 'boolean', default: false },
    production: { type: 'boolean', default: false },
    port: { type: 'string', default: '5174' },
  },
})
const root = fileURLToPath(new URL('../', import.meta.url))
const dist = path.join(root, 'dist')
await mkdir(dist, { recursive: true })
await Promise.all([
  copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html')),
  ...['favicon.png', 'wallinde-lockup-dark.png', 'wallinde-icon-light.png'].map(file =>
    copyFile(path.join(root, 'public', file), path.join(dist, file))),
])
const options = {
  absWorkingDir: root,
  entryPoints: ['src/main.tsx'],
  outfile: 'dist/assets/app.js',
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  target: ['es2022'],
  minify: values.production,
  sourcemap: !values.production,
  define: { 'process.env.NODE_ENV': JSON.stringify(values.production ? 'production' : 'development') },
  logLevel: 'info',
}
if (values.serve) {
  const ctx = await context(options)
  if (!values.production) await ctx.watch()
  const upstream = await ctx.serve({ servedir: dist, host: '127.0.0.1', port: 0 })
  const server = createServer((incoming, outgoing) => {
    const api = incoming.url?.startsWith('/api/v1/')
    const headers = api ? {
      'content-type': incoming.headers['content-type'] ?? 'application/json',
      ...(incoming.headers.authorization ? { authorization: incoming.headers.authorization } : {}),
    } : {}
    const proxy = request({
      host: '127.0.0.1', port: api ? 8000 : upstream.port,
      path: !api && incoming.url?.split('?')[0] === '/live' ? '/' : incoming.url,
      method: incoming.method, headers, timeout: 15000,
    }, response => {
      outgoing.writeHead(response.statusCode ?? 502, {
        ...response.headers, 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      })
      response.pipe(outgoing)
    })
    proxy.on('timeout', () => proxy.destroy())
    proxy.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      outgoing.end(JSON.stringify({ error: { code: 'BACKEND_UNAVAILABLE' } }))
    })
    incoming.on('aborted', () => proxy.destroy())
    incoming.pipe(proxy)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(values.port), '127.0.0.1', resolve)
  })
  console.log(`Dashboard demo: http://127.0.0.1:${values.port}; authenticated live view: /live`)
  const stop = async () => { server.close(); await ctx.dispose(); process.exit(0) }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
} else {
  await build(options)
}
