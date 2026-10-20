// 从官方 CDN 拉取塔防精灵游戏配置表，解析关联成 data/heroes.json
// 用法：node scripts/export-heroes/export-heroes.mjs
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../data/heroes.json')
const CDN = 'https://mszctest-1300944069.file.myqcloud.com/miyaVideoH5/web-mobile'
const UA =
  'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0 Mobile Safari/537.36'

function fetchText(url) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          fetchText(new URL(res.headers.location, url).toString()).then(resolve)
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve(res.statusCode === 200 ? Buffer.concat(chunks).toString('utf8') : null)
        )
        res.on('error', () => resolve(null))
      }
    )
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
    req.on('error', () => resolve(null))
  })
}

function parseSettings(raw) {
  const m = raw.match(/bundleVers:\s*\{([^}]*)\}/)
  const bundleVers = {}
  if (m)
    for (const pair of m[1].split(',')) {
      const idx = pair.indexOf(':')
      if (idx < 0) continue
      const k = pair.slice(0, idx).trim().replace(/['"]/g, '')
      const v = pair.slice(idx + 1).trim().replace(/['"]/g, '')
      if (k && v) bundleVers[k] = v
    }
  return bundleVers
}

const BASE64_VALUES = (() => {
  const s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const m = {}
  for (let i = 0; i < s.length; i++) m[s.charCodeAt(i)] = i
  return m
})()
const HEX_CHARS = '0123456789abcdef'.split('')
const UUID_TEMPLATE = '00000000-0000-0000-0000-000000000000'.split('')
// 标准 uuid 模板 36 字符含 4 个连字符，hex 只填 32 个非连字符位（跳过 8/13/18/23）
const INDICES = [
  0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22, 24, 25, 26,
  27, 28, 29, 30, 31, 32, 33, 34, 35
]
function parseBundleIndex(config) {
  const uuids = config.uuids || []
  const redirect = config.redirect || []
  const versions = config.versions || {}
  const redirectMap = {}
  for (let i = 0; i < redirect.length; i += 2) redirectMap[redirect[i]] = redirect[i + 1]
  const resolveIdx = (k) => {
    let cur = k,
      g = 0
    while (redirectMap[cur] !== undefined && g++ < 100) cur = redirectMap[cur]
    return cur
  }
  const decode = (k) => {
    if (typeof k === 'number') k = uuids[resolveIdx(k)]
    if (typeof k !== 'string') return String(k)
    if (/^[0-9a-fA-F]{32}$/.test(k))
      return (
        k.slice(0, 8) +
        '-' +
        k.slice(8, 12) +
        '-' +
        k.slice(12, 16) +
        '-' +
        k.slice(16, 20) +
        '-' +
        k.slice(20)
      )
    if (k.length === 22) {
      const t = UUID_TEMPLATE.slice()
      t[0] = k[0]
      t[1] = k[1]
      for (let i = 2, j = 2; i < 22; i += 2) {
        const lhs = BASE64_VALUES[k.charCodeAt(i)]
        const rhs = BASE64_VALUES[k.charCodeAt(i + 1)]
        t[INDICES[j++]] = HEX_CHARS[lhs >> 2]
        t[INDICES[j++]] = HEX_CHARS[((lhs & 3) << 2) | (rhs >> 4)]
        t[INDICES[j++]] = HEX_CHARS[rhs & 0xf]
      }
      return t.join('')
    }
    return k
  }
  const importRelByUuid = new Map()
  const importHashByUuid = new Map()
  for (let i = 0; i < (versions.import || []).length; i += 2) {
    const k = versions.import[i],
      h = versions.import[i + 1]
    if (k === undefined || h === undefined) continue
    const uuid = decode(k)
    importHashByUuid.set(uuid, h)
    importRelByUuid.set(uuid, `import/${uuid.slice(0, 2)}/${uuid}.${h}.json`)
  }
  const packByUuid = new Map()
  const packs = config.packs || {}
  for (const [packId, list] of Object.entries(packs)) {
    if (!Array.isArray(list)) continue
    const pid = decode(packId)
    const packHash = importHashByUuid.get(pid)
    if (!packHash) continue
    const rel = `import/${pid.slice(0, 2)}/${pid}.${packHash}.json`
    for (let i = 0; i < list.length; i++) {
      const uuid = decode(list[i])
      if (uuid && !packByUuid.has(uuid)) packByUuid.set(uuid, { rel, index: i })
    }
  }
  return { importRelByUuid, importHashByUuid, packByUuid }
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
  // CSV 允许引号字段内换行（如 HeroSkinTableData 中文描述行），先把引号内的 \r\n 合并，避免行号错位吞列
  let merged = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      inQ = !inQ
      merged += c
    } else if (inQ && c === '\n') {
      merged += ' '
    } else if (inQ && c === '\r') {
      // 丢弃 \r，避免 \r\n 变成空格+换行
    } else {
      merged += c
    }
  }
  const lines = merged.split(/\r?\n/)
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length < 4) return []
  // Cocos 表：3 行元数据 + 数据。字段名所在行分两种：
  //   标准表：第1行=英文字段名 / 第2行=类型 / 第3行=中文描述
  //   特殊表(如 HeroSkinTableData)：第1行=类型 / 第2行=中文描述 / 第3行=英文字段名
  // 判断第3行是否为「英文字段名行」(全为合法标识符)：是则取第3行，否则取第1行。
  // 数据固定从第4行(索引3)开始。
  const isFieldNameRow = (cols) =>
    cols.length > 0 && cols.every((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.trim()))
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

// 核心表 uuid（标准 36 位）
const TABLE_UUIDS = {
  HeroTableData: '7d112ecd-1e55-4365-99e5-f1738efa66cf',
  NpcTemplateTableData: 'ada85cac-652d-440b-ae96-2a12339dd920',
  SkillTableData: '25abd541-ec2c-4c55-8e45-da1ae5e2c41c',
  PassiveSkillTableData: 'a8b456ad-5e83-40a1-a382-481d69ab27ef',
  HeroTalentTableData: 'e6547958-e595-41d0-93a8-32b81d5921af',
  HeroSkinTableData: '20c425ab-4282-4ba6-9df6-76f91271bf18',
  ResTableData: 'f8b5ebbd-27f4-422a-b95f-fe6ed2da0d70'
}

async function fetchTable(index, uuid, name) {
  let rel = index.importRelByUuid.get(uuid)
  const packed = index.packByUuid.get(uuid)
  if (!rel && packed) rel = packed.rel
  if (!rel) return null
  let txt = await fetchText(`${CDN}/assets/resources/${rel}`)
  if (!txt) return null
  if (packed) {
    const arr = JSON.parse(txt)
    txt = JSON.stringify(arr[packed.index])
  }
  const ta = extractTextAssets(txt).find((t) => t.name === name)
  return ta ? parseCocosTable(ta.text) : null
}

// 官方配置表 CSV 解析（三段元数据表头，自动定位字段名/类型/说明行）。
// 游戏表为「字段名 / 类型 / 中文描述」三段元数据 + 数据行，且三段顺序不固定；
// 该实现靠分类+打分自动定位表头/类型/说明行，比按行号硬猜稳健得多。
function csvParseRows(text) {
  const src = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []
  let row = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}
const CSV_KNOWN_TYPE = /^(NUMBER|STRING|BOOL|INT|FLOAT|LONG|INTEGER|TEXT|DOUBLE|DECIMAL|S|STR)$/i
const CSV_TYPE_LIKE = /^[a-z]+(<.*>)$/i
const CSV_CHINESE = /[一-龥]/
const csvIsTypeToken = (c) => {
  const s = String(c == null ? '' : c).trim()
  return !!s && (CSV_KNOWN_TYPE.test(s) || CSV_TYPE_LIKE.test(s))
}
function csvIsTypeRow(row) {
  if (!row || row.length < 2) return false
  let nonEmpty = 0
  let hits = 0
  for (const c of row) {
    const s = String(c == null ? '' : c).trim()
    if (!s) continue
    nonEmpty++
    if (csvIsTypeToken(s)) hits++
  }
  return nonEmpty >= 2 && hits >= Math.max(2, Math.ceil(nonEmpty / 2))
}
function csvIsHeaderRow(row) {
  if (!row || row.length < 2) return false
  let nonEmpty = 0
  for (const c of row) {
    const s = String(c == null ? '' : c).trim()
    if (!s) continue
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return false
    nonEmpty++
  }
  return nonEmpty >= 2
}
const csvIsDescRow = (row) => !!row && row.some((c) => CSV_CHINESE.test(String(c == null ? '' : c)))
function csvIsHeaderLike(row) {
  if (!row || row.length < 2) return false
  let nonEmpty = 0
  let hits = 0
  for (const c of row) {
    const s = String(c == null ? '' : c).trim()
    if (!s) continue
    nonEmpty++
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) hits++
  }
  return nonEmpty >= 2 && hits >= 2 && hits >= Math.ceil(nonEmpty / 2)
}
function csvClassifyRow(row) {
  if (csvIsTypeRow(row)) return 'type'
  if (csvIsDescRow(row)) return 'desc'
  if (csvIsHeaderRow(row)) return 'header'
  return 'unknown'
}
function csvScoreBlock(rows, classes, k) {
  let tCount = 0
  let hStrict = 0
  let hLike = 0
  let dCount = 0
  for (let i = 0; i < k; i++) {
    const c = classes[i]
    if (c === 'type') tCount++
    else if (c === 'header') hStrict++
    else if (c === 'desc') { if (csvIsHeaderLike(rows[i])) hLike++; else dCount++ }
  }
  if (tCount < 1) return -Infinity
  let score = 3
  score += hStrict ? 3 : hLike ? 2 : 0
  if (dCount === 1) score += 2
  const lastIsDescLike = classes[k - 1] !== 'header' && classes[k - 1] !== 'type'
  if (dCount > 1 && lastIsDescLike) score -= 4 * (dCount - 1)
  if (tCount > 1) score -= 3 * (tCount - 1)
  if (hStrict + hLike > 2) score -= 3 * (hStrict + hLike - 2)
  if (classes[k] === 'header' || classes[k] === 'type') score -= 5
  score -= k * 0.1
  return score
}
function parseCocosCsv(text) {
  const rows = csvParseRows(text)
  if (!rows.length) return null
  const classes = []
  for (let i = 0; i < Math.min(rows.length, 12); i++) classes.push(csvClassifyRow(rows[i]))
  if (!classes.includes('type')) {
    return { headers: rows[0] || [], rows: rows.slice(1) }
  }
  let bestK = -1
  let bestScore = -Infinity
  const maxK = Math.min(11, rows.length - 1)
  for (let k = 1; k <= maxK; k++) {
    const s = csvScoreBlock(rows, classes, k)
    if (s > bestScore) { bestScore = s; bestK = k }
  }
  if (bestK < 1) return { headers: rows[0] || [], rows: rows.slice(1) }
  let headers = null
  let hIdx = -1
  for (let i = 0; i < bestK; i++) {
    if (classes[i] === 'header') { headers = rows[i]; hIdx = i; break }
  }
  if (headers === null) {
    for (let i = 0; i < bestK; i++) {
      if (classes[i] !== 'type' && csvIsHeaderLike(rows[i])) { headers = rows[i]; hIdx = i; break }
    }
  }
  if (headers === null) { headers = rows[0]; hIdx = 0 }
  let types = []
  for (let i = 0; i < bestK; i++) {
    if (classes[i] === 'type') { types = rows[i]; break }
  }
  const numericFirstCol = /^(NUMBER|INT|INTEGER|LONG|FLOAT|DOUBLE|DECIMAL)$/i.test(String((types[0] || '')).trim())
  if (numericFirstCol) {
    let guard = 0
    while (bestK < rows.length - 1 && guard < 20) {
      const first = String((rows[bestK] && rows[bestK][0] != null ? rows[bestK][0] : '')).trim()
      if (first === '' || /^-?\d+(\.\d+)?$/.test(first)) break
      bestK++
      guard++
    }
  }
  const dataRows = rows.slice(bestK)
  return { headers, rows: dataRows }
}
function parseCocosTable(text) {
  const parsed = parseCocosCsv(text)
  if (!parsed || !parsed.headers || parsed.headers.length < 2) return []
  const headers = parsed.headers
  return parsed.rows.map((row) => {
    const obj = {}
    headers.forEach((h, i) => { if (h) obj[h] = row[i] === undefined ? '' : row[i] })
    return obj
  })
}

function stripSkillPrefix(s) {
  return String(s || '')
    .trim()
    .replace(/^技能[:：]\s*/, '')
    .trim()
}
function stripPassivePrefix(s) {
  return String(s || '')
    .trim()
    .replace(/^(初始被动|满星被动)\s*/, '')
    .trim()
}

// ============ 升级档位推导（按星级/等级线性插值）============
function buildIndexMaps(skillRows, npcRows, talentRows) {
  const skillById = new Map()
  const skillByName = new Map()
  for (const r of skillRows || []) {
    skillById.set(String(r.id), r)
    const nm = String(r.name || '').trim()
    if (nm && !skillByName.has(nm)) skillByName.set(nm, r)
  }
  const npcRowsById = new Map()
  for (const r of npcRows || []) {
    const key = String(r.id ?? '')
    if (!key) continue
    const arr = npcRowsById.get(key) || []
    arr.push(r)
    npcRowsById.set(key, arr)
  }
  // 技能名 → 多行（老英雄同名技能分散在多个 id 上，按此回退找有描述的那条）
  const skillByNameAll = new Map()
  for (const r of skillRows || []) {
    const nm = String(r.name || '').trim()
    if (!nm) continue
    const arr = skillByNameAll.get(nm) || []
    arr.push(r)
    skillByNameAll.set(nm, arr)
  }
  for (const arr of npcRowsById.values()) arr.sort((a, b) => Number(a.level) - Number(b.level))
  const talentsByHero = new Map()
  for (const t of talentRows || []) {
    const hid = String(t.heroId ?? '')
    if (!hid) continue
    const arr = talentsByHero.get(hid) || []
    arr.push(t)
    talentsByHero.set(hid, arr)
  }
  for (const arr of talentsByHero.values()) arr.sort((a, b) => Number(a.level) - Number(b.level))
  return { skillById, skillByName, skillByNameAll, npcRowsById, talentsByHero }
}

// 按等级属性（官方面板数值源，NpcTemplate / SkillTableData 推导）：
//   attack = NpcTemplate 行 attack，生命 = 行 carhp，攻速 = 该行 skill_id 对应 SkillTableData.cd（毫秒）
// 面板「属性详情」用：给定等级取「level ≤ 当前等级」的最后一行。
function buildHeroStats(maps, npcId) {
  const { npcRowsById, skillById } = maps
  const rows = npcRowsById.get(String(npcId)) || []
  const out = []
  for (const r of rows) {
    const sid = String(r.skill_id ?? '')
    const sk = sid && sid !== '0' ? skillById.get(sid) : null
    const cd = sk ? Number(sk.cd) : NaN
    const attack = Number(r.attack)
    const hp = Number(r.carhp)
    const dtype = Number(r.damage_type)
    out.push({
      level: Number(r.level) || 1,
      attack: Number.isFinite(attack) ? attack : null,
      hp: Number.isFinite(hp) ? hp : null,
      cd: Number.isFinite(cd) ? cd : null,
      // 攻击类型（面板用）：1物理 2魔法 3真实 4治疗 5其他（部分行缺失）
      damageType: Number.isFinite(dtype) && String(r.damage_type) !== '' ? dtype : null
    })
  }
  return out
}

function npcSkillNodes(npcRowsById, npcId) {
  const rows = npcRowsById.get(String(npcId)) || []
  const out = []
  let prev = ''
  for (const r of rows) {
    const sid = String(r.skill_id ?? '')
    if (!sid || sid === '0') continue
    if (sid === prev) continue
    prev = sid
    out.push({ level: Number(r.level) || 1, skillId: sid })
  }
  return out
}
function heroSkillNodes(skillNodes, talentsByHero, heroId, npcId) {
  if (skillNodes.length) return skillNodes
  const hid = Number(heroId) || 0
  const fallback = [{ level: 1, skillId: String(hid) }]
  let ups = 0
  for (const t of talentsByHero.get(String(heroId)) || []) {
    const lv = Number(t.level) || 0
    if (!lv) continue
    if (String(t.name || '').trim() === '技能强化') ups++
    fallback.push({ level: lv, skillId: String(hid + 100 * ups) })
  }
  return fallback
}
function heroLevelNodes(skillNodes, talentsByHero, heroId, npcId) {
  const set = new Set([1])
  for (const n of skillNodes) if (n.level >= 1) set.add(n.level)
  for (const t of talentsByHero.get(String(heroId)) || []) {
    const lv = Number(t.level) || 0
    if (lv >= 1) set.add(lv)
  }
  return [...set].sort((a, b) => a - b)
}
function buildTiers(maps, hid, npcId, heroSkillName, heroSkillDesc, heroPassiveInitial, heroPassiveFull) {
  const { skillById, skillByNameAll, npcRowsById, talentsByHero } = maps
  const skills = npcSkillNodes(npcRowsById, npcId)
  const skillNodes = heroSkillNodes(skills, talentsByHero, hid, npcId)
  const levels = heroLevelNodes(skillNodes, talentsByHero, hid, npcId)
  const talents = talentsByHero.get(String(hid)) || []
  // 老英雄的 npc.skill_id 指向的技能行 skill_desc 为空，但同名技能在低 id 行有描述
  // （如 战将：npc→30106 空，同名 id=13 有「对单个目标造成100%攻击伤害」）。
  // 缓存「同名行里 id 最小且有描述」的那条，供整条 tier 链回退。
  const namedDescCache = new Map()
  const descByName = (skill) => {
    const own = stripSkillPrefix(skill && skill.skill_desc)
    if (own) return own
    const nm = String((skill && skill.name) || '').trim()
    if (!nm) return ''
    if (namedDescCache.has(nm)) return namedDescCache.get(nm)
    const cands = (skillByNameAll.get(nm) || []).filter((r) => stripSkillPrefix(r.skill_desc))
    cands.sort((a, b) => Number(a.id) - Number(b.id))
    const hit = cands.length ? stripSkillPrefix(cands[0].skill_desc) : ''
    namedDescCache.set(nm, hit)
    return hit
  }
  const tiers = []
  for (const lv of levels) {
    let skillId = skillNodes.length ? skillNodes[0].skillId : String(hid)
    for (const n of skillNodes) if (lv >= n.level) skillId = n.skillId
    const s = skillById.get(skillId)
    let talent = null
    for (const t of talents) if (lv >= (Number(t.level) || 0)) talent = t
    const prev = tiers[tiers.length - 1]
    tiers.push({
      level: lv,
      skillName: String(s?.name || '').trim() || prev?.skillName || heroSkillName,
      skillDesc: descByName(s) || prev?.skillDesc || heroSkillDesc,
      passiveInitial:
        stripPassivePrefix(talent?.passiveSkilldesc) ||
        prev?.passiveInitial ||
        stripPassivePrefix(heroPassiveInitial),
      passiveFull:
        stripPassivePrefix(talent?.maxPassiveSkilldesc) ||
        prev?.passiveFull ||
        stripPassivePrefix(heroPassiveFull),
      talentName: String(talent?.name || '').trim(),
      talentDesc: String(talent?.describe || '').trim()
    })
  }
  return tiers
}

;(async () => {
  const html = await fetchText(`${CDN}/index.html`)
  const m = html.match(/src\/settings\.([a-f0-9]+)\.js/)
  if (!m) return console.log('FAIL: settings hash')
  const settings = await fetchText(`${CDN}/src/settings.${m[1]}.js`)
  const bundleVers = parseSettings(settings)
  const ver = bundleVers['resources']
  console.log('resources ver =', ver)
  const config = JSON.parse(await fetchText(`${CDN}/assets/resources/config.${ver}.json`))
  const index = parseBundleIndex(config)
  const heroRows = await fetchTable(index, TABLE_UUIDS.HeroTableData, 'HeroTableData')
  const npcRows = await fetchTable(index, TABLE_UUIDS.NpcTemplateTableData, 'NpcTemplateTableData')
  const skillRows = await fetchTable(index, TABLE_UUIDS.SkillTableData, 'SkillTableData')
  const passiveRows = await fetchTable(index, TABLE_UUIDS.PassiveSkillTableData, 'PassiveSkillTableData')
  const talentRows = await fetchTable(index, TABLE_UUIDS.HeroTalentTableData, 'HeroTalentTableData')
  const skinRows = await fetchTable(index, TABLE_UUIDS.HeroSkinTableData, 'HeroSkinTableData')
  const resRows = await fetchTable(index, TABLE_UUIDS.ResTableData, 'ResTableData')
  console.log(
    `表行数 hero=${heroRows?.length} npc=${npcRows?.length} skill=${skillRows?.length} passive=${passiveRows?.length} talent=${talentRows?.length} skin=${skinRows?.length} res=${resRows?.length}`
  )
  const npcById = new Map((npcRows || []).map((r) => [String(r.id), r]))
  const resById = new Map((resRows || []).map((r) => [String(r.id), r]))
  const maps = buildIndexMaps(skillRows, npcRows, talentRows)
  const skinsByHero = new Map()
  for (const s of skinRows || []) {
    const hid = String(s.heroItemId ?? '')
    if (!hid) continue
    const arr = skinsByHero.get(hid) || []
    arr.push(s)
    skinsByHero.set(hid, arr)
  }
  // 跳过脏行（英雄表 CSV 末尾偶发空 id/name 行，会让前端多出无名英雄卡）
  let heroes = (heroRows || [])
    .filter((h) => String(h.id || '').trim() && String(h.name || '').trim())
    .map((h) => {
    const npc = npcById.get(String(h.npc_id)) || {}
    const baseSkill = maps.skillById.get(String(h.id))
    const skillNameRaw = String(h.skill_name || '').trim()
    const heroSkillName =
      baseSkill && /^技能\d*$/.test(skillNameRaw) && String(baseSkill.name || '').trim()
        ? String(baseSkill.name).trim()
        : skillNameRaw
    const heroSkillDesc = stripSkillPrefix(baseSkill?.skill_desc || h.skill_desc || '')
    // spine 动画目录：npc.res_id → ResTableData.animation（形如 combat/animation/hero/qiqi/...）
    // 只认 hero 动画；目录名与 data/hero-spine/<folder> 对应，前端图鉴据此播放（与 export-spine.mjs 同源）
    const res = resById.get(String(npc.res_id ?? '')) || {}
    const anim = String(res.animation || '')
    // 动画目录 + 基础模型名：combat/animation/hero/<目录>/<模型>
    // 多个英雄可能共用同一目录（如 木精灵/魔精灵/光精灵 都在 jingling/），
    // 故必须连模型名一起记录，否则会读成别的英雄的模型（表现为「木精灵显示成魔精灵」）
    const spine = anim.startsWith('combat/animation/hero/') ? anim.split('/')[3] : ''
    const spineModel = anim.startsWith('combat/animation/hero/') && anim.split('/')[4] ? anim.split('/')[4] : ''
    return {
      id: h.id,
      name: h.name,
      occupation: h.occupation,
      positioning: h.hero_positioning,
      heroColor: Number(h.hero_color),
      heroDesc: h.hero_desc,
      skillName: heroSkillName,
      skillDesc: heroSkillDesc,
      passiveName: h.passive_name,
      passiveDesc: h.passive_desc,
      passiveDesc2: h.passive_desc2,
      image: h.image,
      attrs: {
        attack: npc.attack,
        hp: npc.hp,
        attackSpeed: npc.attack_speed,
        damageType: npc.damage_type,
        pureDamageDesc: npc.pureDamage_desc,
        trueDamageDesc: npc.trueDamage_desc,
        critical: npc.critical
      },
      tiers: buildTiers(
        maps,
        h.id,
        String(h.npc_id ?? ''),
        heroSkillName,
        heroSkillDesc,
        h.passive_desc,
        h.passive_desc2
      ),
      spine,
      spineModel,
      stats: buildHeroStats(maps, h.npc_id),
      // 皮肤 → 独立骨骼模型（官方每个皮肤在英雄动画目录下有独立资源，路径名即模型名）
      skins: (skinsByHero.get(String(h.id)) || []).map((sk) => {
        const npc = npcById.get(String(Number(sk.id) * 10000 + (Number(h.id) || 0)))
        const res = npc ? resById.get(String(npc.res_id)) : null
        const a = String((res && res.animation) || '')
        const parts = a.split('/')
        const model = a.startsWith('combat/animation/hero/') && parts.length >= 5 ? parts[4] : ''
        return Object.assign({}, sk, { model: model || '' })
      })
    }
  })
  // 官方表里同一英雄常有两条 id（低 id 正式行 + 高 id 重复行），重复行的技能文案可能缺失：
  // 用同名的有文案行按 tier 索引补齐（两条行数一致时逐档补）
  const hdByName = new Map()
  for (const h of heroes) {
    const arr = hdByName.get(h.name) || []
    arr.push(h)
    hdByName.set(h.name, arr)
  }
  for (const arr of hdByName.values()) {
    if (arr.length < 2) continue
    const donor = arr.find((h) => (h.tiers || []).some((t) => String(t.skillDesc || '').trim()))
    if (!donor) continue
    for (const h of arr) {
      if (h === donor) continue
      donor.tiers.forEach((dt, i) => {
        if (h.tiers[i] && !String(h.tiers[i].skillDesc || '').trim()) h.tiers[i].skillDesc = dt.skillDesc
      })
    }
  }
  // 🔴 2026-10-21 同名去重：游戏每个英雄一条，官方表存在 id=31xx 的占位桩条目（0 皮肤/1 档位），
  // 按名字合并 —— 保留 tiers 最多者（其次 skins 最多，再次 id 最小），避免图鉴出现重复卡。
  const uniqByName = new Map()
  for (const h of heroes) {
    const prev = uniqByName.get(h.name)
    if (!prev) { uniqByName.set(h.name, h); continue }
    const score = (x) => (x.tiers ? x.tiers.length : 0) * 1000 + (x.skins ? x.skins.length : 0) * 10 - Number(x.id || 0) / 1e6
    if (score(h) > score(prev)) uniqByName.set(h.name, h)
  }
  heroes = Array.from(uniqByName.values())
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(heroes, null, 2))
  console.log(`✅ 写入 ${heroes.length} 个英雄（同名去重后） -> ${OUT}`)
})()
