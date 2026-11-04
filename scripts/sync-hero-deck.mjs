// 英雄图鉴官方数据同步 / 校验
// 数据源：微信小游戏官方缓存（APPID wxa46b2910643e4c31）里的 staticTableData 配置表包，
//        以及 resources 资源包 / 官方资源 CDN。不依赖任何第三方工具箱或离线整理包。
//
// 用法：
//   node scripts/sync-hero-deck.mjs                  # 解析官方表并输出与图鉴的差异报告（只读）
//   node scripts/sync-hero-deck.mjs --emit          # 额外导出官方表快照到 data/official/
//   node scripts/sync-hero-deck.mjs --apply         # 把官方元数据保守补齐到 hero-snapshot.json（只填空字段，不新增/覆盖）
//   TFJL_GAMECACHES=<gamecaches 目录> node ...      # 手动指定缓存位置（自动定位失败时）
//
// 说明：立绘图集、铭牌图集、Spine 骨骼等二进制素材同样来自官方 resources bundle，
//      提取器见 scripts/export-heroes/extract-official-spine.py。
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPID = 'wxa46b2910643e4c31'
const args = new Set(process.argv.slice(2))
const EMIT = args.has('--emit')
const APPLY = args.has('--apply')

// ── 1. 自动定位官方微信小游戏缓存 ──────────────────────────────
function isValidCache(dir) {
  try {
    const std = path.join(dir, 'staticTableData')
    return fs.statSync(std).isDirectory() &&
      fs.readdirSync(std).some((f) => f.endsWith('.json')) &&
      fs.existsSync(path.join(dir, 'resources'))
  } catch { return false }
}
function* walkAppletRoots() {
  const homes = [
    'D:/systeam/Documents/WeChat Files',
    'C:/Users/Administrator/Documents/WeChat Files',
    path.join(os.homedir(), 'Documents', 'WeChat Files'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Tencent', 'xwechat', 'radium', 'users')
  ]
  for (const h of homes) {
    if (!fs.existsSync(h)) continue
    let entries = []
    try { entries = fs.readdirSync(h, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const base = path.join(h, e.name)
      // 老版微信：Applet/<appid>/usr/gamecaches；新版 xwechat：applet/local/<appid>/usr/gamecaches
      yield path.join(base, 'Applet', APPID, 'usr', 'gamecaches')
      yield path.join(base, 'applet', 'local', APPID, 'usr', 'gamecaches')
      yield path.join(base, 'usr', 'gamecaches')
      // xwechat users/<hash>/applet/local/... 多一层账号目录
      try {
        for (const sub of fs.readdirSync(base, { withFileTypes: true })) {
          if (sub.isDirectory()) yield path.join(base, sub.name, 'applet', 'local', APPID, 'usr', 'gamecaches')
        }
      } catch { /* ignore */ }
    }
  }
}
function findGamecaches() {
  const env = process.env.TFJL_GAMECACHES
  if (env && isValidCache(env)) return env
  if (env) console.warn(`! TFJL_GAMECACHES 指定的目录不可用：${env}，改为自动定位`)
  for (const d of walkAppletRoots()) if (isValidCache(d)) return d
  return null
}

// ── 2. 解析官方 staticTableData 表包 ───────────────────────────
function parseCSV(text) {
  const rows = []
  let row = [], cur = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else quoted = false }
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}
// 表头 = 前 3 行里第一列 id、第二列为纯英文列名的那行（Hero 表在 L0、Skin 表在 L2）
function tableRows(csv) {
  const rows = parseCSV(csv)
  const hi = rows.findIndex((r, i) => i < 3 && r[0] === 'id' && /^[A-Za-z_]+$/.test(r[1] || ''))
  if (hi < 0) return []
  const head = rows[hi]
  return rows.slice(hi + 1)
    .filter((r) => /^\d+$/.test(String(r[0] || '').trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}
function loadOfficialTables(cacheDir) {
  const std = path.join(cacheDir, 'staticTableData')
  const files = fs.readdirSync(std).filter((f) => f.endsWith('.json'))
    .sort((a, b) => fs.statSync(path.join(std, b)).size - fs.statSync(path.join(std, a)).size)
  if (!files.length) throw new Error('staticTableData 里没有表包 JSON')
  const bundle = files[0]
  const data = JSON.parse(fs.readFileSync(path.join(std, bundle), 'utf8'))
  const tables = new Map()
  for (const e of (Array.isArray(data[5]) ? data[5] : [])) {
    const tr = e?.[0]?.[0]
    if (Array.isArray(tr) && typeof tr[1] === 'string' && typeof tr[2] === 'string') tables.set(tr[1], tr[2])
  }
  return { bundle, tableCount: tables.size, heroes: tableRows(tables.get('HeroTableData') || ''), skins: tableRows(tables.get('HeroSkinTableData') || '') }
}

// ── 3. 与项目图鉴数据比对 ──────────────────────────────────────
const snapPath = path.join(ROOT, 'data', 'hero-deck', 'hero-snapshot.json')
const heroesPath = path.join(ROOT, 'data', 'heroes.json')
const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'))
const projectHeroes = JSON.parse(fs.readFileSync(heroesPath, 'utf8'))
const heroIds = new Set(projectHeroes.map((h) => String(h.id)))
const forms = snap.allForms || {}
const snapSkinNames = new Set()
for (const v of Object.values(forms)) {
  for (const sk of (v?.skins || [])) if (sk && sk.name && sk.name !== '默认') snapSkinNames.add(sk.name)
}

const cache = findGamecaches()
if (!cache) {
  console.error('✗ 未找到官方微信小游戏缓存（gamecaches）。请设置 TFJL_GAMECACHES=<目录> 后重试。')
  process.exit(1)
}
const official = loadOfficialTables(cache)

console.log('=== 官方数据源 ===')
console.log('  缓存目录 :', cache)
console.log('  表包文件 :', official.bundle, `（共 ${official.tableCount} 张官方配置表）`)
console.log('  HeroTableData 行数 :', official.heroes.length)
console.log('  HeroSkinTableData 行数 :', official.skins.length)

const officialHeroes = official.heroes.filter((h) => heroIds.has(String(h.id)))
const missingHeroIds = [...heroIds].filter((id) => !official.heroes.some((h) => String(h.id) === id))
const officialSkinNames = new Set(official.skins.map((s) => s.note).filter(Boolean))
const onlyOfficial = [...officialSkinNames].filter((n) => !snapSkinNames.has(n))
const onlyProject = [...snapSkinNames].filter((n) => !officialSkinNames.has(n))

console.log('\n=== 与图鉴比对 ===')
console.log(`  官方可收集英雄（与 data/heroes.json 交集）: ${officialHeroes.length} / ${heroIds.size}`)
if (missingHeroIds.length) console.log(`  ⚠ 图鉴有、官方表查无的英雄 id: ${missingHeroIds.join(', ')}`)
else console.log('  ✓ 图鉴 102 位英雄全部能在官方 HeroTableData 中找到')
console.log(`  图鉴皮肤名（不含"默认"）: ${snapSkinNames.size}；官方皮肤名: ${officialSkinNames.size}`)
console.log(`  官方有、图鉴无: ${onlyOfficial.length}${onlyOfficial.length ? ' → ' + onlyOfficial.slice(0, 20).join(' / ') : ''}`)
console.log(`  图鉴有、官方表无: ${onlyProject.length}${onlyProject.length ? ' → ' + onlyProject.slice(0, 20).join(' / ') : ''}`)

// 字段级校验：官方表 name / occupation / hero_color 与项目 heroes.json
const diffs = []
for (const oh of officialHeroes) {
  const ph = projectHeroes.find((h) => String(h.id) === String(oh.id))
  if (!ph) continue
  if (oh.name && ph.name && oh.name !== ph.name) diffs.push(`id=${oh.id} name: 官方「${oh.name}」 vs 项目「${ph.name}」`)
  if (oh.occupation && ph.occupation && String(oh.occupation) !== String(ph.occupation)) diffs.push(`id=${oh.id} occupation: 官方 ${oh.occupation} vs 项目 ${ph.occupation}`)
  if (oh.hero_color && ph.heroColor && String(oh.hero_color) !== String(ph.heroColor)) diffs.push(`id=${oh.id} heroColor: 官方 ${oh.hero_color} vs 项目 ${ph.heroColor}`)
}
console.log(`  字段差异: ${diffs.length}${diffs.length ? '\n    - ' + diffs.slice(0, 10).join('\n    - ') : ' ✓ 无'}`)

// ── 4. 导出官方表快照（供项目引用）──────────────────────────────
if (EMIT) {
  const outDir = path.join(ROOT, 'data', 'official')
  fs.mkdirSync(outDir, { recursive: true })
  const meta = {
    source: '微信小游戏官方缓存 staticTableData（APPID ' + APPID + '）',
    bundle: official.bundle,
    extractedAt: new Date().toISOString(),
    note: '本文件由 gameserver 官方配置表直接解析生成，不含任何第三方工具箱加工数据'
  }
  fs.writeFileSync(path.join(outDir, 'hero-table.json'), JSON.stringify({ meta, rows: official.heroes }, null, 2))
  fs.writeFileSync(path.join(outDir, 'hero-skin-table.json'), JSON.stringify({ meta, rows: official.skins }, null, 2))
  console.log('\n✓ 已导出官方快照: data/official/hero-table.json, hero-skin-table.json')
}

// ── 5. 保守补齐官方元数据（只填空字段，绝不新增/覆盖）──────────
if (APPLY) {
  const byNote = new Map(official.skins.filter((s) => s.note).map((s) => [s.note, s]))
  let filled = 0
  for (const v of Object.values(forms)) {
    for (const sk of (v?.skins || [])) {
      const o = byNote.get(sk.name)
      if (!o) continue
      if (!sk.desc && o.describe) { sk.desc = o.describe; filled++ }
      if (!sk.officialItemId && o.itemId) { sk.officialItemId = o.itemId; filled++ }
      if (!sk.officialHeroItemId && o.heroItemId) { sk.officialHeroItemId = o.heroItemId; filled++ }
      if (!sk.officialSource) { sk.officialSource = 'staticTableData/HeroSkinTableData'; filled++ }
    }
  }
  if (filled) {
    fs.writeFileSync(snapPath, JSON.stringify(snap))
    console.log(`\n✓ 已把 ${filled} 处官方元数据补入 hero-snapshot.json（仅填补空字段）`)
  } else console.log('\n· 无需补齐，图鉴元数据已完整')
}

if (!EMIT && !APPLY) console.log('\n（只读模式。加 --emit 导出官方快照，或 --apply 保守补齐元数据）')
