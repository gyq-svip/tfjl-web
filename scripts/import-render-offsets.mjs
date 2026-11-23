// 临时脚本：把逐模型缩放/偏移参数（render-offsets.json，x/y/scale）合并进 data/hero-spine/index.json
import fs from 'fs'

// 参数文件路径（按本机实际存放位置修改）
const OFF = process.env.RENDER_OFFSETS || 'D:/game-res/render-offsets.json'
const IDX = 'data/hero-spine/index.json'
const off = JSON.parse(fs.readFileSync(OFF, 'utf8')).offsets || {}
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'))

let merged = 0, skipped = []
for (const key of Object.keys(off)) {
  const sep = key.lastIndexOf('|')
  const folder = key.slice(0, sep), model = key.slice(sep + 1)
  const entry = idx[folder]
  if (!entry) { skipped.push(key); continue }
  entry.modelOffsets = entry.modelOffsets || {}
  // 官方默认模型键为 folder|folder；我方默认模型目录记录在 entry.model
  const target = (model === folder) ? (entry.model || folder) : model
  entry.modelOffsets[target] = { x: off[key].x || 0, y: off[key].y || 0, scale: off[key].scale || 1 }
  merged++
}
fs.writeFileSync(IDX, JSON.stringify(idx), 'utf8')
console.log('合并条目:', merged, ' 跳过(无此folder):', skipped.length, skipped.slice(0, 10).join(','))
// 抽样验证
const s = idx.qiqi
console.log('qiqi.modelOffsets:', JSON.stringify(s.modelOffsets).slice(0, 300))
