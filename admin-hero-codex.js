/* 英雄卡组 —— 独立模块，与 app-core.js 完全解耦。
 * 数据来自工具箱同源的新 CDN（scripts/export-hero-deck.mjs 导出到 data/hero-deck/heroes.json）。
 * 功能：英雄网格 + 搜索 + 职业/品质筛选 + 详情（技能/被动/分档/定位/攻击类型）。
 * 说明：头像图集与 Spine 纹理在本游戏版本的 Cocos 紧凑打包下暂无法从 CDN 取回（图集纹理 404），
 *       故卡片用「品质色 + 职业」呈现；数据/分档/技能/被动均为官方原始内容。
 */
(function () {
  const OCCUPATION = { 1: '战士', 2: '猎人', 3: '法师', 4: '牧师', 5: '召唤', 6: '精灵', 7: '熊猫', 8: '工程', 9: '术士', 10: '龙族' }
  const ATTACK_TYPE = { 1: '纯粹伤害', 2: '物理伤害', 3: '魔法伤害', 4: '治疗', 5: '召唤', 6: '特殊', 7: '元素', 8: '真实伤害', 9: '真实伤害' }
  const QUALITY = {
    1: { name: '绿', c1: '#3fa45a', c2: '#2c7a42', t: '#bff0c8' },
    2: { name: '蓝', c1: '#4a90d9', c2: '#2f6bb0', t: '#bfe0ff' },
    3: { name: '紫', c1: '#9b59b6', c2: '#76448f', t: '#e6c8ff' },
    4: { name: '金', c1: '#f5b041', c2: '#d99310', t: '#ffe9b8' }
  }
  let heroes = null
  let cache = null
  function baseUrl() {
    const s = document.querySelector('script[src*="admin-hero-codex.js"]')
    let b = ''
    if (s) { b = s.src.split('?')[0]; b = b.slice(0, b.lastIndexOf('/') + 1) }
    return b
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  }
  function qBadge(q) {
    const Q = QUALITY[q] || QUALITY[1]
    return `<span style="font-size:.62rem;padding:1px 6px;border-radius:8px;color:#10131a;font-weight:700;background:linear-gradient(180deg,${Q.c1},${Q.c2})">${Q.name}</span>`
  }
  function occBadge(o) {
    return `<span style="font-size:.62rem;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.8)">${OCCUPATION[o] || '—'}</span>`
  }
  async function getData() {
    if (cache) return cache
    const r = await fetch(baseUrl() + 'data/hero-deck/heroes.json')
    heroes = await r.json()
    // 排序：品质降序 → 职业 → id
    heroes.sort((a, b) => (b.heroColor - a.heroColor) || (a.occupation - b.occupation) || (Number(a.id) - Number(b.id)))
    cache = heroes
    return heroes
  }
  function buildUI() {
    const ov = document.getElementById('heroDeckOverlay')
    if (ov) return ov
    const el = document.createElement('div')
    el.id = 'heroDeckOverlay'
    el.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(8,10,16,.92);display:none;flex-direction:column;'
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap;">
        <div style="font-size:1.15rem;font-weight:700;color:#ffd76b;">🎴 英雄卡组 <span style="font-size:.7rem;color:rgba(255,255,255,.45);font-weight:400;">官方数据 · 内测</span></div>
        <input id="hdSearch" placeholder="搜索英雄名…" style="flex:1;min-width:160px;max-width:260px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;font-size:.9rem;">
        <select id="hdOcc" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#1a1f2b;color:#fff;font-size:.85rem;">
          <option value="">全部职业</option>
          ${Object.entries(OCCUPATION).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <select id="hdQ" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#1a1f2b;color:#fff;font-size:.85rem;">
          <option value="">全部品质</option>
          ${Object.entries(QUALITY).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
        </select>
        <div id="hdCount" style="font-size:.8rem;color:rgba(255,255,255,.5);"></div>
        <button onclick="window.closeHeroDeck()" style="margin-left:auto;padding:8px 14px;border:none;border-radius:8px;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font-size:.9rem;">关闭 ✕</button>
      </div>
      <div style="flex:1;display:flex;min-height:0;">
        <div id="hdGridWrap" style="flex:1;overflow:auto;padding:16px;">
          <div id="hdGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:12px;"></div>
        </div>
        <div id="hdDetail" style="width:380px;max-width:42vw;overflow:auto;padding:18px;border-left:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);display:none;"></div>
      </div>`
    document.body.appendChild(el)
    el.querySelector('#hdSearch').addEventListener('input', render)
    el.querySelector('#hdOcc').addEventListener('change', render)
    el.querySelector('#hdQ').addEventListener('change', render)
    return el
  }
  function cardHTML(h) {
    const Q = QUALITY[h.heroColor] || QUALITY[1]
    const pos = (h.heroDesc || '').replace(/^定位[:：]/, '')
    return `<div class="hd-card" data-id="${esc(h.id)}" style="cursor:pointer;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.01));border:1px solid ${Q.c1}55;box-shadow:0 2px 10px rgba(0,0,0,.3);transition:transform .12s;display:flex;flex-direction:column;">
      <div style="height:96px;background:linear-gradient(135deg,${Q.c1},${Q.c2});display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;color:${Q.t};text-shadow:0 2px 6px rgba(0,0,0,.4);">${esc(h.name.slice(0, 1))}</div>
      <div style="padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
        <div style="font-weight:700;color:#fff;font-size:.95rem;display:flex;align-items:center;gap:6px;justify-content:space-between;">
          <span>${esc(h.name)}</span>${qBadge(h.heroColor)}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${occBadge(h.occupation)}${ATTACK_TYPE[h.occupation] ? `<span style="font-size:.62rem;padding:1px 6px;border-radius:8px;background:rgba(255,215,107,.15);color:#ffd76b;">${ATTACK_TYPE[h.occupation]}</span>` : ''}</div>
        <div style="font-size:.7rem;color:rgba(255,255,255,.55);line-height:1.3;min-height:2em;">${esc(pos) || '—'}</div>
      </div>
    </div>`
  }
  function detailHTML(h) {
    const Q = QUALITY[h.heroColor] || QUALITY[1]
    const pos = (h.heroDesc || '').replace(/^定位[:：]/, '')
    const tiers = (h.tiers || []).map((t) => `<tr>
      <td style="padding:4px 6px;color:#ffd76b;font-weight:700;">Lv.${t.level}</td>
      <td style="padding:4px 6px;color:rgba(255,255,255,.85);">${esc(t.skillDesc || '')}</td>
      <td style="padding:4px 6px;color:rgba(255,255,255,.7);">${esc(t.passiveInitial || '')}</td>
      <td style="padding:4px 6px;color:rgba(255,255,255,.7);">${esc(t.passiveFull || '')}</td>
      <td style="padding:4px 6px;color:rgba(255,215,107,.85);">${esc(t.talentName ? (t.talentName + '：' + (t.talentDesc || '')) : '')}</td>
    </tr>`).join('')
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:64px;height:64px;border-radius:10px;background:linear-gradient(135deg,${Q.c1},${Q.c2});display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:800;color:${Q.t};">${esc(h.name.slice(0, 1))}</div>
        <div>
          <div style="font-size:1.1rem;font-weight:800;color:#fff;">${esc(h.name)} ${qBadge(h.heroColor)}</div>
          <div style="font-size:.78rem;color:rgba(255,255,255,.6);margin-top:3px;">${occBadge(h.occupation)} ${ATTACK_TYPE[h.occupation] ? `<span style="font-size:.62rem;padding:1px 6px;border-radius:8px;background:rgba(255,215,107,.15);color:#ffd76b;margin-left:4px;">${ATTACK_TYPE[h.occupation]}</span>` : ''}</div>
        </div>
      </div>
      <div style="font-size:.82rem;color:rgba(255,255,255,.7);margin-bottom:12px;">📍 定位：${esc(pos) || '—'}</div>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:700;color:#ffd76b;margin-bottom:6px;">⚔️ ${esc(h.skillName || '技能')}</div>
        <div style="font-size:.85rem;color:rgba(255,255,255,.85);line-height:1.5;">${esc(h.skillDesc || '—')}</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:700;color:#ffd76b;margin-bottom:6px;">🌟 ${esc(h.passiveName || '被动')}</div>
        <div style="font-size:.85rem;color:rgba(255,255,255,.85);line-height:1.5;">${esc(h.passiveDesc || '')}</div>
        ${h.passiveDesc2 ? `<div style="font-size:.78rem;color:rgba(255,255,255,.55);margin-top:6px;line-height:1.5;">${esc(h.passiveDesc2)}</div>` : ''}
      </div>
      <div style="font-weight:700;color:#ffd76b;margin-bottom:6px;">📊 分档 / 天赋预览</div>
      <div style="overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:.74rem;">
          <thead><tr style="background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);">
            <th style="padding:4px 6px;text-align:left;">等级</th><th style="padding:4px 6px;text-align:left;">技能</th><th style="padding:4px 6px;text-align:left;">初始被动</th><th style="padding:4px 6px;text-align:left;">满星被动</th><th style="padding:4px 6px;text-align:left;">天赋</th>
          </tr></thead>
          <tbody>${(tiers || '<tr><td colspan="5" style="padding:8px;color:rgba(255,255,255,.4);">无分档数据</td></tr>')}</tbody>
        </table>
      </div>
      <div style="font-size:.7rem;color:rgba(255,255,255,.4);margin-top:14px;line-height:1.5;">※ 头像与 Spine 动画因本游戏版本图集纹理暂无法从 CDN 取回，暂以品质色呈现；数据/分档/技能/被动均为官方原始内容。</div>`
  }
  function render() {
    const ov = document.getElementById('heroDeckOverlay')
    const grid = ov.querySelector('#hdGrid')
    const q = (ov.querySelector('#hdSearch').value || '').trim().toLowerCase()
    const occ = ov.querySelector('#hdOcc').value
    const qf = ov.querySelector('#hdQ').value
    const list = (heroes || []).filter((h) => {
      if (occ && String(h.occupation) !== occ) return false
      if (qf && String(h.heroColor) !== qf) return false
      if (q && !(h.name || '').toLowerCase().includes(q) && !(h.desc || '').toLowerCase().includes(q)) return false
      return true
    })
    grid.innerHTML = list.map(cardHTML).join('')
    ov.querySelector('#hdCount').textContent = `${list.length} / ${heroes.length}`
    grid.querySelectorAll('.hd-card').forEach((c) => {
      c.addEventListener('click', () => {
        const h = heroes.find((x) => String(x.id) === c.dataset.id)
        const det = ov.querySelector('#hdDetail')
        det.innerHTML = detailHTML(h)
        det.style.display = 'block'
        grid.querySelectorAll('.hd-card').forEach((x) => (x.style.outline = 'none'))
        c.style.outline = '2px solid #ffd76b'
      })
    })
  }
  window.openHeroDeck = async function () {
    const ov = buildUI()
    ov.style.display = 'flex'
    if (!heroes) {
      ov.querySelector('#hdGrid').innerHTML = '<div style="color:rgba(255,255,255,.5);padding:20px;">加载中…</div>'
      try { await getData(); render() } catch (e) { ov.querySelector('#hdGrid').innerHTML = '<div style="color:#ff8a8a;padding:20px;">数据加载失败：' + esc(e.message) + '</div>' }
    }
  }
  window.closeHeroDeck = function () { const ov = document.getElementById('heroDeckOverlay'); if (ov) ov.style.display = 'none' }
})()
