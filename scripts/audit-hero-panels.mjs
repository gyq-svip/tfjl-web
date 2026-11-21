// 英雄详情面板批量审计工具（自带静态服务器，无需额外起服务）
// 用法：
//   node scripts/audit-hero-panels.mjs              # 全量 102 英雄
//   node scripts/audit-hero-panels.mjs 咕咕,电法,小野 # 只测指定英雄
// 产物：docs/panel-audit/audit.json（指标）、shots/*.png（截图）
// 指标说明：hFrac=可见内容高度占画布比例（正常 0.45~0.75）；comps=连通块数（>2 多为翅膀/光效碎片，非重影）
import http from 'http'
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'

const OUT = 'docs/panel-audit'
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true })

// ---- 自带静态服务器 ----
const root = process.cwd()
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain', '.css': 'text/css', '.ico': 'image/x-icon' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const f = path.join(root, p)
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
    res.end(d)
  })
})
await new Promise(r => server.listen(8123, r))

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
await page.goto('http://localhost:8123/index.html', { waitUntil: 'domcontentloaded', timeout: 60000, retries: 5 }).catch(async () => {
  await new Promise(r => setTimeout(r, 4000))
  await page.goto('http://localhost:8123/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
})
await page.waitForFunction(() => window.spineHero, { timeout: 60000 })
await page.evaluate(() => window.spineHero.warm())
await page.waitForFunction(() => window.spine, { timeout: 60000 })
await page.waitForTimeout(3500)
// 动画索引里有逐英雄 scale，必须等它加载，否则缩放不生效、测量失真
await page.evaluate(async () => {
  if (!window.__heroSpineIndex || !Object.keys(window.__heroSpineIndex).length) {
    try { window.__heroSpineIndex = await (await fetch('data/hero-spine/index.json')).json() } catch (e) {}
  }
})
const env = await page.evaluate(() => ({
  heroes: Object.keys(window.heroesOfficialMap || {}).length,
  cloudFusions: Object.keys(window.cloudFusions || {}).length,
  spineIndex: Object.keys(window.__heroSpineIndex || {}).length
}))
console.log('ENV: ' + JSON.stringify(env))

await page.evaluate(() => {
  window.__measure = function () {
    const root = document.querySelector('.hero-detail-root')
    if (!root) return { err: 'no-modal' }
    const cvs = [...root.querySelectorAll('canvas')]
    if (!cvs.length) return { err: 'no-canvas' }
    const c = cvs.reduce((a, b) => (b.clientWidth * b.clientHeight > a.clientWidth * a.clientHeight ? b : a))
    const w = c.width, h = c.height
    if (!w || !h) return { err: 'canvas-0' }
    const d = c.getContext('2d').getImageData(0, 0, w, h).data
    let cnt = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
    const GX = 80, GY = 40
    const grid = new Uint8Array(GX * GY)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        cnt++
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
        grid[Math.min(GY - 1, (y * GY / h) | 0) * GX + Math.min(GX - 1, (x * GX / w) | 0)] = 1
      }
    }
    if (maxX < 0) return { err: 'empty', w, h }
    const seen = new Uint8Array(GX * GY)
    let comps = 0
    const areas = []
    for (let i = 0; i < GX * GY; i++) {
      if (!grid[i] || seen[i]) continue
      comps++
      let area = 0
      const st = [i]; seen[i] = 1
      while (st.length) {
        const p = st.pop(); area++
        const px = p % GX, py = (p / GX) | 0
        const nb = []
        if (px > 0) nb.push(p - 1)
        if (px < GX - 1) nb.push(p + 1)
        if (py > 0) nb.push(p - GX)
        if (py < GY - 1) nb.push(p + GX)
        for (const n of nb) if (grid[n] && !seen[n]) { seen[n] = 1; st.push(n) }
      }
      areas.push(area)
    }
    return {
      w, h, cnt,
      hFrac: +((maxY - minY + 1) / h).toFixed(3),
      wFrac: +((maxX - minX + 1) / w).toFixed(3),
      cyFrac: +(((minY + maxY) / 2) / h).toFixed(3),
      comps: areas.filter(a => a > 12).length
    }
  }
})

const filter = process.argv[2] ? process.argv[2].split(',') : null
const list = await page.evaluate(() => Object.keys(window.heroesOfficialMap || {}))
const heroes = filter || list
console.log('将审计 ' + heroes.length + ' 个英雄')

const rows = []
for (const name of heroes) {
  const info = await page.evaluate(async (n) => {
    const meta = (window.heroesOfficialMap || {})[n] || {}
    const q = ({ 1: 'green', 2: 'green', 3: 'blue', 4: 'purple', 5: 'gold' })[meta.heroColor] || 'gold'
    try { document.querySelectorAll('.hero-detail-root').forEach(el => el.remove()) } catch (e) {}
    try { window.showHeroDetailModal(null, 'audit-' + n, q, 'my', n) } catch (e) { return { err: 'open-fail:' + e.message } }
    await new Promise(r => setTimeout(r, 2000))
    const m = window.__measure()
    let fuse = { btn: false, items: 0 }
    const root = document.querySelector('.hero-detail-root')
    if (root) {
      const fb = [...root.querySelectorAll('button')].find(b => ((b.querySelector('img') || {}).src || '').includes('icon-fuse2'))
      if (fb) {
        fuse.btn = true
        fb.click()
        await new Promise(r => setTimeout(r, 1200))
        const dlg = document.querySelector('.hd-sub-fuse')
        if (dlg) {
          const tip = [...dlg.querySelectorAll('div')].find(d => (d.textContent || '').trim() === '👇 选择要融合的副卡')
          if (tip && tip.parentElement) fuse.items = tip.parentElement.children.length - 1
        }
      }
    }
    return { m, fuse }
  }, name)
  try {
    const root = await page.$('.hero-detail-root')
    if (root) await root.screenshot({ path: path.join(OUT, 'shots', name.replace(/[\\/:*?"<>|]/g, '_') + '.png') })
  } catch (e) {}
  const m = (info && info.m) || {}
  rows.push({ hero: name, ...m, fuse: (info && info.fuse) || {} })
  const flag = m.err ? ('❌ ' + m.err) : (m.hFrac < 0.25 ? '⚠️ 太小' : (m.hFrac > 0.85 ? '⚠️ 过大' : (m.comps > 2 ? '⚠️ 多块' : '✅')))
  console.log(name + ' | ' + flag + ' | h=' + m.hFrac + ' comps=' + m.comps + ' | fuseBtn=' + (info.fuse?.btn) + ' 副卡项=' + (info.fuse?.items))
}
fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(rows, null, 1), 'utf8')
console.log('\n已写出 ' + path.join(OUT, 'audit.json'))
await browser.close()
server.close()
process.exit(0)
