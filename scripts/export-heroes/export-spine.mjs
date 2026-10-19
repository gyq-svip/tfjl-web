// 英雄 Spine 动画资源导出（PoC：官方 CDN → 解析 Cocos sp.SkeletonData → 标准 Spine 3.8 文件）
// 用法：
//   node scripts/export-heroes/export-spine.mjs 小野    # 单英雄
//   node scripts/export-heroes/export-spine.mjs --all  # 批量（data/heroes.json 里所有带 spine 的英雄）
// 输出：data/hero-spine/<folder>/  skeleton.json + atlas.txt + p*.png
// 资源定位机制与官方 CDN 同源。
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../../data/hero-spine')
const CDN = 'https://mszctest-1300944069.file.myqcloud.com/miyaVideoH5/web-mobile'
const UA =
  'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0 Mobile Safari/537.36'

const UUIDS = {
  HeroTableData: '7d112ecd-1e55-4365-99e5-f1738efa66cf',
  NpcTemplateTableData: 'ada85cac-652d-440b-ae96-2a12339dd920',
  ResTableData: 'f8b5ebbd-27f4-422a-b95f-fe6ed2da0d70'
}

function singleRequest(url, timeout) {
  return new Promise((resolve) => {
    let u
    try {
      u = new URL(url)
    } catch {
      resolve({ status: 0, buf: Buffer.alloc(0) })
      return
    }
    const req = https.get(u, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        singleRequest(new URL(res.headers.location, url).toString(), timeout).then(resolve)
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode || 0, buf: Buffer.concat(chunks) }))
      res.on('error', () => resolve({ status: 0, buf: Buffer.alloc(0) }))
    })
    req.setTimeout(timeout, () => req.destroy(new Error('timeout')))
    req.on('error', () => resolve({ status: 0, buf: Buffer.alloc(0) }))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function fetchBuffer(url, retry = 3) {
  for (let i = 0; i <= retry; i++) {
    const r = await singleRequest(url, 30000)
    if (r.status === 200 || r.status === 404 || r.status === 403) return r
    if (i < retry) await sleep(800 * (i + 1))
  }
  return { status: 0, buf: Buffer.alloc(0) }
}
async function fetchText(url) {
  const { status, buf } = await fetchBuffer(url)
  return status === 200 ? buf.toString('utf8') : null
}

function parseSettings(raw) {
  const m = raw.match(/bundleVers:\s*\{([^}]*)\}/)
  const out = {}
  if (m)
    for (const pair of m[1].split(',')) {
      const idx = pair.indexOf(':')
      if (idx < 0) continue
      const k = pair.slice(0, idx).trim().replace(/['"]/g, '')
      const v = pair.slice(idx + 1).trim().replace(/['"]/g, '')
      if (k && v) out[k] = v
    }
  return out
}

const BASE64_VALUES = (() => {
  const s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const m = {}
  for (let i = 0; i < 64; i++) m[s.charCodeAt(i)] = i
  return m
})()
const HEX = '0123456789abcdef'.split('')
const UT = '00000000-0000-0000-0000-000000000000'.split('')
const IDX = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]
function decode(k) {
  if (typeof k !== 'string') return String(k)
  if (/^[0-9a-fA-F]{32}$/.test(k))
    return `${k.slice(0, 8)}-${k.slice(8, 12)}-${k.slice(12, 16)}-${k.slice(16, 20)}-${k.slice(20)}`
  if (k.length === 22) {
    const t = UT.slice()
    t[0] = k[0]
    t[1] = k[1]
    for (let i = 2, j = 2; i < 22; i += 2) {
      const lhs = BASE64_VALUES[k.charCodeAt(i)]
      const rhs = BASE64_VALUES[k.charCodeAt(i + 1)]
      t[IDX[j++]] = HEX[lhs >> 2]
      t[IDX[j++]] = HEX[((lhs & 3) << 2) | (rhs >> 4)]
      t[IDX[j++]] = HEX[rhs & 0xf]
    }
    return t.join('')
  }
  return k
}

function parseBundleIndexFull(config) {
  const uuids = config.uuids || []
  const redirect = config.redirect || []
  const types = config.types || []
  const versions = config.versions || {}
  const redirectMap = {}
  for (let i = 0; i < redirect.length; i += 2) redirectMap[redirect[i]] = redirect[i + 1]
  const resolveIdx = (k) => {
    let cur = k,
      g = 0
    while (redirectMap[cur] !== undefined && g++ < 100) cur = redirectMap[cur]
    return cur
  }
  const uuidAt = (idx) => decode(uuids[resolveIdx(idx)])

  const importRelByUuid = new Map()
  for (let i = 0; i < (versions.import || []).length; i += 2) {
    const k = versions.import[i]
    const h = versions.import[i + 1]
    if (k === undefined || h === undefined) continue
    const uuid = typeof k === 'number' ? uuidAt(k) : String(k)
    importRelByUuid.set(uuid, `import/${uuid.slice(0, 2)}/${uuid}.${h}.json`)
  }
  // native 清单 key 可能是图集短 id（string）或索引（number）
  const nativeRelByUuid = new Map()
  const nativeHashByUuid = new Set()
  for (let i = 0; i < (versions.native || []).length; i += 2) {
    const k = versions.native[i]
    const h = versions.native[i + 1]
    if (k === undefined || h === undefined) continue
    const key = typeof k === 'number' ? uuidAt(k) : String(k)
    nativeHashByUuid.add(key)
    nativeRelByUuid.set(key, `native/${key.slice(0, 2)}/${key}.${h}`)
  }
  const uuidByPath = new Map()
  const paths = config.paths || {}
  for (const key of Object.keys(paths)) {
    const entry = paths[key]
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
    const idx = Number(key)
    if (!Number.isFinite(idx) || idx < 0 || idx >= uuids.length) continue
    const list = uuidByPath.get(entry[0]) || []
    list.push({ uuid: uuidAt(idx), type: types[entry[1]] || '' })
    uuidByPath.set(entry[0], list)
  }
  return { importRelByUuid, nativeRelByUuid, nativeHashByUuid, uuidByPath }
}

// 从 import 文本提取「能在 native 清单查到」的引用（图集短 id 直接命中；22 位压缩 uuid 解码后命中）
function extractNativeRefs(text, index) {
  const out = new Set()
  const re = /"([^"\s]{4,64})"/g
  let m
  while ((m = re.exec(text))) {
    const raw = m[1]
    if (index.nativeHashByUuid.has(raw)) {
      out.add(raw)
      continue
    }
    const d = decode(raw)
    if (d !== raw && index.nativeHashByUuid.has(d)) out.add(d)
  }
  return out
}

function extractTextAssets(text) {
  let doc
  try {
    doc = JSON.parse(text)
  } catch {
    return []
  }
  const out = []
  const walk = (node, depth) => {
    if (depth > 12) return
    if (Array.isArray(node)) {
      if (node.length >= 3 && node[0] === 0 && typeof node[1] === 'string' && typeof node[2] === 'string') {
        out.push({ name: node[1], text: node[2] })
        return
      }
      for (const c of node) walk(c, depth + 1)
    } else if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k], depth + 1)
    }
  }
  walk(doc, 0)
  return out
}
function parseCsvRow(line) {
  const out = []
  let cur = '',
    q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else if (c === '"') q = true
    else cur += c
  }
  out.push(cur)
  return out
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/)
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length < 4) return []
  const isFieldNameRow = (cols) => cols.length > 0 && cols.every((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.trim()))
  let headerLine = 0
  if (isFieldNameRow(parseCsvRow(lines[2] || ''))) headerLine = 2
  const headers = parseCsvRow(lines[headerLine]).map((h) => h.trim())
  const rows = []
  for (let i = 3; i < lines.length; i++) {
    const vals = parseCsvRow(lines[i])
    if (!vals[0] || !vals[0].trim()) continue
    const obj = {}
    headers.forEach((h, j) => (obj[h] = vals[j]))
    rows.push(obj)
  }
  return rows
}
async function fetchTable(index, uuid, name) {
  const rel = index.importRelByUuid.get(uuid)
  if (!rel) return null
  const txt = await fetchText(`${CDN}/assets/resources/${rel}`)
  if (!txt) return null
  const ta = extractTextAssets(txt).find((t) => t.name === name)
  return ta ? parseCsv(ta.text) : null
}

// 解析 Cocos sp.SkeletonData import JSON → 标准 Spine 3.8 { skeletonJson, atlasText }
function parseCocosSkeleton(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  const classDefs = data.find((x) => Array.isArray(x) && x.length && Array.isArray(x[0]) && typeof x[0][0] === 'string')
  if (!Array.isArray(classDefs)) return null
  const skIdx = classDefs.findIndex((c) => c[0] === 'sp.SkeletonData')
  if (skIdx < 0) return null
  const fields = classDefs[skIdx][1]
  if (!Array.isArray(fields)) return null
  // sp.SkeletonData 对象在「含数字 classId 且带字符串字段」的顶层数组（objects）里；
  // 必须排除纯数字的 assigns 数组（如 [[0,0,1,2,3,4,5]]），否则会错娶它当 objects
  const objects = data.find(
    (x) =>
      Array.isArray(x) &&
      x.some((e) => Array.isArray(e) && typeof e[0] === 'number' && e.length >= 3 && e.some((v) => typeof v === 'string'))
  )
  if (!Array.isArray(objects)) return null
  const obj = objects.find((e) => Array.isArray(e) && e[0] === skIdx)
  if (!Array.isArray(obj)) return null
  const base = typeof obj[0] === 'number' ? 1 : 0
  const pick = (name) => {
    const i = fields.indexOf(name)
    return i >= 0 ? obj[i + base] : undefined
  }
  const asSkeleton = (v) => {
    if (typeof v === 'string') {
      try {
        return JSON.parse(v)
      } catch {
        return null
      }
    }
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  }
  let atlasText = pick('_atlasText')
  let skeletonJson = asSkeleton(pick('_skeletonJson'))
  if (typeof atlasText !== 'string') {
    atlasText = obj.find((v) => typeof v === 'string' && v.includes('size:') && v.includes('format:'))
  }
  if (!skeletonJson || !skeletonJson.skeleton) {
    skeletonJson = obj.map(asSkeleton).find((v) => v && v.skeleton && Array.isArray(v.bones)) || skeletonJson
  }
  if (!atlasText || typeof atlasText !== 'string') return null
  if (!skeletonJson || typeof skeletonJson !== 'object') return null
  return { skeletonJson, atlasText }
}

// 共享 CDN 上下文：索引/配置/三张表只拉一次，批量导出时复用
async function setupCtx() {
  const html = await fetchText(`${CDN}/index.html`)
  const m = html && html.match(/src\/settings\.([a-f0-9]+)\.js/)
  if (!m) throw new Error('settings hash 未找到')
  const settings = await fetchText(`${CDN}/src/settings.${m[1]}.js`)
  const ver = parseSettings(settings)['resources']
  console.log('resources ver =', ver)
  const config = JSON.parse(await fetchText(`${CDN}/assets/resources/config.${ver}.json`))
  const index = parseBundleIndexFull(config)
  const heroRows = await fetchTable(index, UUIDS.HeroTableData, 'HeroTableData')
  const npcRows = await fetchTable(index, UUIDS.NpcTemplateTableData, 'NpcTemplateTableData')
  const resRows = await fetchTable(index, UUIDS.ResTableData, 'ResTableData')
  return { index, heroRows, npcRows, resRows }
}

// 导出单个英雄：下载 → 解析 → 落盘。返回结果对象（不碰 manifest，由调用方汇总）
async function exportHero(ctx, HERO) {
  const { index, heroRows, npcRows, resRows } = ctx
  const hero = (heroRows || []).find((h) => String(h.name).trim() === HERO)
  if (!hero) return { ok: false, reason: '未找到英雄' }
  const npc = (npcRows || []).find((r) => String(r.id) === String(hero.npc_id))
  const res = (resRows || []).find((r) => String(r.id) === String(npc && npc.res_id))
  const anim = String((res && res.animation) || '')
  if (!anim.startsWith('combat/animation/hero/')) return { ok: false, reason: '非英雄动画: ' + anim }

  const entries = index.uuidByPath.get(anim) || []
  const typeByUuid = new Map(entries.map((e) => [e.uuid, e.type]))

  // 1) 逐个 entry 拉 import：sp.SkeletonData → 解析；并提取 native 引用（贴图）
  const refs = new Set()
  let skeletonJson = null
  let atlasText = null
  for (const e of entries) {
    const rel = index.importRelByUuid.get(e.uuid)
    if (!rel) continue
    const txt = await fetchText(`${CDN}/assets/resources/${rel}`)
    if (!txt) continue
    if (e.type === 'sp.SkeletonData') {
      const parsed = parseCocosSkeleton(txt)
      if (parsed) {
        skeletonJson = parsed.skeletonJson
        atlasText = parsed.atlasText
      }
    }
    for (const r of extractNativeRefs(txt, index)) refs.add(r)
  }
  // 2) 下载 native 贴图（跳过 sp.SkeletonData，它无 native）
  const pngs = []
  for (const uuid of refs) {
    if (typeByUuid.get(uuid) === 'sp.SkeletonData') continue
    const rel = index.nativeRelByUuid.get(uuid)
    if (!rel) continue
    const { status, buf } = await fetchBuffer(`${CDN}/assets/resources/${rel}.png`)
    if (status === 200 && buf.length) pngs.push(buf)
  }
  if (!skeletonJson || !atlasText || !pngs.length)
    return { ok: false, reason: '资源不完整 skeleton=' + !!skeletonJson + ' atlas=' + !!atlasText + ' pngs=' + pngs.length }

  const folder = anim.split('/')[3]
  const outDir = path.join(OUT_DIR, folder)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'skeleton.json'), JSON.stringify(skeletonJson))
  fs.writeFileSync(path.join(outDir, 'atlas.txt'), atlasText)
  pngs.forEach((b, i) => fs.writeFileSync(path.join(outDir, `p${i}.png`), b))
  const totalKB = Math.round(pngs.reduce((a, b) => a + b.length, 0) / 1024)
  return {
    ok: true,
    folder,
    anims: Object.keys(skeletonJson.animations || {}),
    pngCount: pngs.length,
    totalKB,
    entry: {
      hero: HERO,
      anims: Object.keys(skeletonJson.animations || {}),
      pngs: pngs.length,
      updated: new Date().toISOString().slice(0, 10)
    }
  }
}

// 读现有 manifest 并合并新条目后写回
function mergeManifest(entries) {
  const indexPath = path.join(OUT_DIR, 'index.json')
  let indexJson = {}
  try {
    indexJson = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  } catch {}
  Object.assign(indexJson, entries)
  fs.writeFileSync(indexPath, JSON.stringify(indexJson, null, 2))
  return Object.keys(indexJson).length
}

;(async () => {
  const arg = (process.argv[2] || '小野').trim()
  const ctx = await setupCtx()

  if (arg === '--all' || arg === '--batch') {
    // 目标清单来自 data/heroes.json 的 spine 字段（export-heroes.mjs 与 CDN 同源生成）
    const heroesJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data/heroes.json'), 'utf8'))
    const targets = heroesJson.filter((h) => h.spine).map((h) => ({ name: h.name, spine: h.spine }))
    console.log(`批量导出：共 ${targets.length} 个英雄`)
    const entries = {}
    let ok = 0
    let fail = 0
    const failures = []
    const CHUNK = 4 // 并发度：CDN 友好，失败有重试兜底
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK)
      const results = await Promise.all(
        chunk.map(async (t) => {
          try {
            return { t, r: await exportHero(ctx, t.name) }
          } catch (e) {
            return { t, r: { ok: false, reason: String((e && e.message) || e) } }
          }
        })
      )
      for (const { t, r } of results) {
        if (r.ok) {
          ok++
          entries[r.folder] = r.entry
          if (r.folder !== t.spine) console.log(`  ⚠ ${t.name}: CDN 目录 ${r.folder} 与 heroes.json 的 ${t.spine} 不一致（按 CDN 为准）`)
          console.log(`✅ [${ok + fail}/${targets.length}] ${t.name} -> ${r.folder}（${r.pngCount} png / ${r.totalKB}KB / ${r.anims.length} anims）`)
        } else {
          fail++
          failures.push(t.name)
          console.log(`✗ [${ok + fail}/${targets.length}] ${t.name}: ${r.reason}`)
        }
      }
    }
    const total = mergeManifest(entries)
    console.log(`==================== 批量完成 ====================`)
    console.log(`成功 ${ok} / 失败 ${fail}，manifest 共登记 ${total} 个目录`)
    if (failures.length) {
      console.log(`失败清单（可逐个重跑 node scripts/export-heroes/export-spine.mjs <名字>）：`)
      console.log(failures.join(', '))
      process.exitCode = 1
    }
    return
  }

  // 单英雄模式
  const r = await exportHero(ctx, arg)
  if (!r.ok) {
    console.log('导出失败：', r.reason)
    process.exitCode = 1
    return
  }
  mergeManifest({ [r.folder]: r.entry })
  console.log(`✅ ${arg} -> ${path.join(OUT_DIR, r.folder)}  skeleton.json + atlas.txt + ${r.pngCount} png（贴图共 ${r.totalKB}KB）`)
  console.log(`📇 已登记 index.json: ${r.folder}`)
})()
