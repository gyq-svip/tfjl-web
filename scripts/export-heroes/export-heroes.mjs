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
  HeroSkinTableData: '20c425ab-4282-4ba6-9df6-76f91271bf18'
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
  return ta ? parseCsv(ta.text) : null
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
  return { skillById, skillByName, npcRowsById, talentsByHero }
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
  const { skillById, npcRowsById, talentsByHero } = maps
  const skills = npcSkillNodes(npcRowsById, npcId)
  const skillNodes = heroSkillNodes(skills, talentsByHero, hid, npcId)
  const levels = heroLevelNodes(skillNodes, talentsByHero, hid, npcId)
  const talents = talentsByHero.get(String(hid)) || []
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
      skillDesc: stripSkillPrefix(s?.skill_desc) || prev?.skillDesc || heroSkillDesc,
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
  console.log(
    `表行数 hero=${heroRows?.length} npc=${npcRows?.length} skill=${skillRows?.length} passive=${passiveRows?.length} talent=${talentRows?.length} skin=${skinRows?.length}`
  )
  const npcById = new Map((npcRows || []).map((r) => [String(r.id), r]))
  const maps = buildIndexMaps(skillRows, npcRows, talentRows)
  const skinsByHero = new Map()
  for (const s of skinRows || []) {
    const hid = String(s.heroItemId ?? '')
    if (!hid) continue
    const arr = skinsByHero.get(hid) || []
    arr.push(s)
    skinsByHero.set(hid, arr)
  }
  const heroes = (heroRows || []).map((h) => {
    const npc = npcById.get(String(h.npc_id)) || {}
    const baseSkill = maps.skillById.get(String(h.id))
    const skillNameRaw = String(h.skill_name || '').trim()
    const heroSkillName =
      baseSkill && /^技能\d*$/.test(skillNameRaw) && String(baseSkill.name || '').trim()
        ? String(baseSkill.name).trim()
        : skillNameRaw
    const heroSkillDesc = stripSkillPrefix(baseSkill?.skill_desc || h.skill_desc || '')
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
      skins: skinsByHero.get(String(h.id)) || []
    }
  })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(heroes, null, 2))
  console.log(`✅ 写入 ${heroes.length} 个英雄 -> ${OUT}`)
})()
