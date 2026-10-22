/* 英雄图鉴 —— 独立模块，与 app-core.js 完全解耦。
 * 数据源：塔防精灵工具箱「更新中心→游戏资源更新」产出的 hero-snapshot.json / hero-assets.json
 *         （scripts/sync-hero-deck.mjs 同步到 data/hero-deck/，版本随工具箱 e9937+）。
 * 还原工具箱「英雄图鉴」页面：金框卡片 + 图集切片立绘 + 搜索/排序/按品质 + 详情。
 * 说明：Spine 模型（105MB）仅本地同步不入库，部署站上详情面板自动回退为立绘展示。
 */
(function () {
  const OCCUPATION = { 1: ['战士', '⚔️'], 2: ['猎人', '🏹'], 3: ['法师', '🔮'], 4: ['牧师', '✨'], 5: ['召唤', '🐾'], 6: ['精灵', '🌿'], 7: ['熊猫', '🐼'], 8: ['工程', '⚙️'], 9: ['术士', '👻'], 10: ['龙族', '🐉'] }
  const QUALITY = {
    1: { name: '绿', c1: '#57b96a', c2: '#2c7a42', t: '#bff0c8' },
    2: { name: '蓝', c1: '#54a3e8', c2: '#2f6bb0', t: '#bfe0ff' },
    3: { name: '紫', c1: '#b06ae0', c2: '#76448f', t: '#e6c8ff' },
    4: { name: '金', c1: '#ffc84d', c2: '#d99310', t: '#ffe9b8' }
  }
  const ASSET_BASE = 'data/hero-deck/assets/'
  let snap = null
  let heroes = []
  let allForms = {}
  let cache = null
  let state = { kw: '', q: 0, sort: 0 } // sort: 0品质默认 1按名称 2按品质

  function baseUrl() {
    const s = document.querySelector('script[src*="admin-hero-codex.js"]')
    let b = ''
    if (s) { b = s.src.split('?')[0]; b = b.slice(0, b.lastIndexOf('/') + 1) }
    return b
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  }
  async function getData() {
    if (cache) return cache
    const r = await fetch(baseUrl() + 'data/hero-deck/hero-snapshot.json')
    snap = await r.json()
    allForms = snap.allForms || {}
    heroes = Object.values(snap.heroData || {})
    cache = true
    return heroes
  }

  /* 图集切片：portraitFile=图集路径，portraitRect=[x,y,w,h]。w=显示宽度，按比例缩放。 */
  function portraitHTML(h, w, extra) {
    const r = h.portraitRect || [0, 0, 204, 198]
    const scale = w / r[2]
    const ht = Math.round(r[3] * scale)
    const url = baseUrl() + ASSET_BASE + (h.portraitFile || '')
    return `<div style="width:${w}px;height:${ht}px;overflow:hidden;border-radius:6px;${extra || ''}">` +
      `<div style="width:${r[2]}px;height:${r[3]}px;background:url('${url}') -${r[0]}px -${r[1]}px no-repeat;transform:scale(${scale});transform-origin:0 0;"></div></div>`
  }

  function fuseCount(h) {
    const f = allForms[h.id] && allForms[h.id].fuses
    return f ? f.length : 1
  }

  function cardHTML(h) {
    const Q = QUALITY[h.heroColor] || QUALITY[1]
    const occ = OCCUPATION[h.occupation] || ['—', '❔']
    const n = fuseCount(h)
    return `<div class="hdc-card" data-id="${esc(h.id)}" style="position:relative;width:152px;border:3px solid #8a5a1c;border-radius:12px;
      background:linear-gradient(180deg,#e9a63b,#c97f16);padding:3px;cursor:pointer;transition:transform .12s;">
      <div style="position:relative;background:linear-gradient(180deg,#f8d878,#f0b43c);border-radius:8px;padding:18px 6px 0;display:flex;flex-direction:column;align-items:center;min-height:196px;">
        <div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);z-index:2;white-space:nowrap;
          background:linear-gradient(180deg,#8f2412,#b23a1d);border:2px solid #ffd76b;border-radius:9px;padding:2px 12px;
          color:#ffe6a8;font-weight:700;font-size:.82rem;text-shadow:0 1px 2px rgba(0,0,0,.6);">${esc(h.name)}</div>
        <div style="position:absolute;top:4px;left:5px;z-index:2;width:26px;height:26px;border-radius:50%;
          background:radial-gradient(circle at 35% 30%,#3b4b66,#1c2637);border:2px solid #d9a441;
          display:flex;align-items:center;justify-content:center;font-size:.85rem;" title="${occ[0]}">${occ[1]}</div>
        ${portraitHTML(h, 128, 'margin-top:6px;box-shadow:0 2px 6px rgba(0,0,0,.35);')}
        <div style="position:absolute;bottom:30px;left:7px;z-index:2;width:30px;height:32px;
          clip-path:polygon(50% 100%,100% 72%,100% 12%,0 12%,0 72%);
          background:linear-gradient(180deg,#ffd968,#e0a01e);border-radius:6px 6px 4px 4px;
          display:flex;align-items:center;justify-content:center;color:#7a1f10;font-weight:800;font-size:.8rem;
          text-shadow:0 1px 0 rgba(255,255,255,.5);" title="融合段数">${n}</div>
        <div style="width:100%;margin-top:6px;border-radius:0 0 6px 6px;background:linear-gradient(180deg,#5a3410,#6e4415);
          color:#fff3d6;font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:space-between;padding:2px 8px;">
          <span>0/${n}</span><span style="color:#ffd968;">⬆</span>
        </div>
      </div>
      <div data-q="${h.heroColor}" style="position:absolute;inset:0;border-radius:12px;pointer-events:none;
        box-shadow:inset 0 0 0 2px ${Q.c1}55;"></div>
    </div>`
  }

  function filterSort() {
    let list = heroes.slice()
    const kw = state.kw.trim().toLowerCase()
    if (kw) list = list.filter((h) => {
      const occ = OCCUPATION[h.occupation] || ['']
      return (h.name || '').toLowerCase().includes(kw)
        || String(occ[0]).toLowerCase().includes(kw)
        || (h.modelFolder || '').toLowerCase().includes(kw)
        || (h.modelFiles || []).some((f) => String(f).toLowerCase().includes(kw))
    })
    if (state.q) list = list.filter((h) => Number(h.heroColor) === state.q)
    if (state.sort === 1) list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))
    else if (state.sort === 2) list.sort((a, b) => (b.heroColor - a.heroColor) || String(a.name).localeCompare(String(b.name), 'zh'))
    else list.sort((a, b) => (b.heroColor - a.heroColor) || (Number(a.id) - Number(b.id)))
    return list
  }

  function renderGrid() {
    const grid = document.getElementById('hdcGrid')
    const tip = document.getElementById('hdcCount')
    if (!grid) return
    const list = filterSort()
    tip.textContent = `共 ${list.length} 位英雄 · 数据表 · 图片素材`
    grid.innerHTML = list.map(cardHTML).join('')
  }

  function detailHTML(h) {
    const Q = QUALITY[h.heroColor] || QUALITY[1]
    const occ = OCCUPATION[h.occupation] || ['—', '❔']
    const form = allForms[h.id] || {}
    const sec = (t, body) => body ? `<div style="margin-top:14px;"><div style="color:#ffd76b;font-weight:700;font-size:.9rem;margin-bottom:6px;">${t}</div>${body}</div>` : ''
    const tiers = (h.tiers || []).map((t) =>
      `<div style="display:flex;gap:10px;padding:5px 8px;border-radius:6px;background:rgba(255,255,255,.05);margin-bottom:4px;">
        <b style="min-width:44px;color:#ffd76b;font-size:.78rem;">Lv${esc(t.level)}</b>
        <div style="flex:1;font-size:.76rem;color:rgba(255,255,255,.78);line-height:1.45;">
          <div>被动：${esc(t.passiveInitial || '')}${t.passiveFull && t.passiveFull !== t.passiveInitial ? ` <span style="color:rgba(255,255,255,.45);">→</span> ${esc(t.passiveFull)}` : ''}</div>
          ${t.talentName ? `<div style="color:#9fd0ff;">天赋·${esc(t.talentName)}：${esc(t.talentDesc || '')}</div>` : ''}
        </div>
      </div>`).join('')
    const fuses = (form.fuses || []).map((f) =>
      `<div style="display:flex;gap:10px;align-items:center;padding:5px 8px;border-radius:6px;background:rgba(255,255,255,.05);margin-bottom:4px;">
        ${f.hasPortrait ? portraitHTML(f, 44) : ''}
        <div><b style="color:#ffe9b8;font-size:.82rem;">${esc(f.name)}</b>
        <div style="color:rgba(255,255,255,.7);font-size:.75rem;">${esc(f.desc || '')}</div></div></div>`).join('')
    const skins = (form.skins || []).map((s) =>
      `<div style="display:flex;gap:10px;align-items:center;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.05);margin-bottom:4px;">
        ${s.hasPortrait ? portraitHTML(s, 52) : ''}
        <div style="flex:1;"><b style="color:#ffe9b8;font-size:.82rem;">${esc(s.name)}</b>${s.model ? `<span style="font-size:.68rem;color:rgba(255,255,255,.5);"> · 模型 ${esc(s.model)}</span>` : ''}
        <div style="color:rgba(255,255,255,.7);font-size:.75rem;">${esc(s.desc || '')}</div></div>
        ${s.model ? `<button class="hdc-skinplay" data-model="${esc(s.model)}" style="flex:none;padding:4px 10px;border-radius:6px;border:1px solid rgba(255,215,107,.4);background:rgba(255,215,107,.12);color:#ffd76b;font-size:.72rem;cursor:pointer;">▶ 动画</button>` : ''}
      </div>`).join('')
    const passive = [h.passiveName ? `<b>${esc(h.passiveName)}</b>` : '', h.passiveDesc ? esc(h.passiveDesc) : '', h.passiveDesc2 ? `<div style="margin-top:4px;color:rgba(255,255,255,.65);">${esc(h.passiveDesc2)}</div>` : ''].filter(Boolean).join('<div style="height:2px"></div>')
    return `
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:none;width:224px;">
          <div style="position:relative;width:224px;height:290px;border:2px solid #d9a441;border-radius:10px;overflow:hidden;background:radial-gradient(circle at 50% 72%,rgba(255,216,104,.16),rgba(0,0,0,.3));">
            <canvas id="hdcSpine" style="width:100%;height:100%;display:block;"></canvas>
            <div id="hdcSpineFallback" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${portraitHTML(h, 180)}</div>
            <div id="hdcSpineStatus" style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:.68rem;color:rgba(255,255,255,.6);padding:3px;background:rgba(0,0,0,.35);">加载动画…</div>
          </div>
          <div style="margin-top:6px;font-size:.66rem;color:rgba(255,255,255,.4);text-align:center;">Spine 实时渲染 · data/hero-spine</div>
        </div>
        <div style="flex:1;min-width:220px;">
          <div style="font-size:1.3rem;font-weight:800;color:#ffd76b;">${esc(h.name)}</div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
            <span style="font-size:.68rem;padding:2px 8px;border-radius:8px;color:#10131a;font-weight:700;background:linear-gradient(180deg,${Q.c1},${Q.c2})">${Q.name}品质</span>
            <span style="font-size:.68rem;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.12);">${occ[1]} ${occ[0]}</span>
            ${h.positioning ? `<span style="font-size:.68rem;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.12);">定位：${esc(h.positioning)}</span>` : ''}
            ${h.modelFolder ? `<span style="font-size:.68rem;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.55);">模型 ${esc(h.modelFolder)}</span>` : ''}
          </div>
          ${h.heroDesc ? `<div style="margin-top:8px;color:rgba(255,255,255,.75);font-size:.8rem;">${esc(h.heroDesc)}</div>` : ''}
          ${sec('⚔️ 技能 · ' + esc(h.skillName || ''), h.skillDesc ? `<div style="color:rgba(255,255,255,.85);font-size:.84rem;line-height:1.5;">${esc(h.skillDesc)}</div>` : '')}
          ${sec('🛡️ 被动', passive)}
          ${sec('⭐ 分档 · 天赋', tiers)}
          ${sec('🔗 融合', fuses)}
          ${sec('🎽 皮肤', skins)}
        </div>
      </div>`
  }

  /* —— Spine 播放（复用 spine-hero.js 的成熟播放器与既有 data/hero-spine 资源，零新增入库）—— */
  let _spineIdxPromise = null
  function spineIndex() {
    if (window.__heroSpineIndex) return Promise.resolve(window.__heroSpineIndex)
    if (_spineIdxPromise) return _spineIdxPromise
    _spineIdxPromise = fetch(baseUrl() + 'data/hero-spine/index.json')
      .then((r) => r.json())
      .then((j) => { window.__heroSpineIndex = j || {}; return window.__heroSpineIndex })
      .catch(() => { window.__heroSpineIndex = window.__heroSpineIndex || {}; return window.__heroSpineIndex })
    return _spineIdxPromise
  }
  let _lastSpineCanvas = null
  let _spineRetry = 0
  function playHeroSpine(h, model) {
    const canvas = document.getElementById('hdcSpine')
    const fb = document.getElementById('hdcSpineFallback')
    const st = document.getElementById('hdcSpineStatus')
    if (!canvas) return
    if (fb) fb.style.display = 'flex'
    if (st) { st.style.display = 'block'; st.textContent = '加载动画…' }
    spineIndex().then((idx) => {
      const man = (window.spineHero && h.modelFolder) ? idx[h.modelFolder] : null
      if (!man) throw new Error('no-spine')
      // 与现有英雄面板同一套参数：默认模型取 index[folder].model，套用官方 modelOffsets 定标
      const useModel = model || man.model || ''
      const pngs = useModel ? ((man.modelPngs || {})[useModel] || 0) : (man.pngs || 0)
      const moff = (man.modelOffsets && (man.modelOffsets[useModel] || man.modelOffsets[man.model])) || {}
      window.spineHero.play(canvas, h.modelFolder, {
        model: useModel || undefined,
        pngs: pngs,
        tight: true,
        hideFx: true,
        // 🟢 统一观感：所有模型按「可见高度」归一化到同一档。
        //   官方 render-offsets 的 scale 是为「特效撑大包围盒」做补偿的（我们不剔特效时必须套），
        //   而图鉴已剔除 fx，再套会导致 200/161/128/113 这种参差；官方 x/y 居中偏移仍然保留。
        fitByHeight: true,
        fitPadding: 0.65,
        offsetX: moff.x || 0,
        offsetY: moff.y || 0,
        onStatus: (s) => {
          const el = document.getElementById('hdcSpineStatus')
          if (!el) return
          // 运行时/资源加载失败自动重试（网络抖动兜底，最多 2 次）
          if (s && /失败/.test(s) && _spineRetry < 2) {
            _spineRetry++
            el.style.display = 'block'
            el.textContent = s + '，自动重试 ' + _spineRetry + '/2…'
            setTimeout(() => { if (document.body.contains(canvas)) playHeroSpine(h, model) }, 1500)
            return
          }
          if (s) { el.style.display = 'block'; el.textContent = s } else { el.style.display = 'none'; el.textContent = '' }
        }
      })
      // 播放起来后撤掉立绘回退；超时仍未播则提示（含重试窗口）
      const t0 = Date.now()
      const poll = () => {
        if (!document.body.contains(canvas)) return
        if (canvas._spineSt && canvas._spineSt.playing) { _spineRetry = 0; if (fb) fb.style.display = 'none'; return }
        if (Date.now() - t0 > 15000) { if (st) { st.textContent = '该模型暂无法播放，可重进详情或刷新页面'; st.style.display = 'block' } return }
        setTimeout(poll, 300)
      }
      poll()
    }).catch(() => {
      if (fb) fb.style.display = 'flex'
      if (st) st.style.display = 'none'
    })
  }

  function openDetail(h) {
    let ov = document.getElementById('hdcDetail')
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'hdcDetail'
      ov.style.cssText = 'position:fixed;inset:0;z-index:99997;background:rgba(4,8,14,.8);display:none;align-items:center;justify-content:center;padding:20px;'
      ov.innerHTML = `<div style="position:relative;max-width:680px;width:100%;max-height:86vh;overflow-y:auto;border-radius:14px;padding:18px 20px;
        background:linear-gradient(180deg,#182c44,#101c2e);border:1px solid rgba(255,215,107,.35);box-shadow:0 10px 40px rgba(0,0,0,.6);">
        <button id="hdcDetailClose" style="position:absolute;top:10px;right:12px;background:rgba(255,255,255,.1);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1rem;">✕</button>
        <div id="hdcDetailBody"></div></div>`
      document.body.appendChild(ov)
      const hide = () => {
        ov.style.display = 'none'
        if (_lastSpineCanvas) { try { window.spineHero && window.spineHero.stop(_lastSpineCanvas) } catch (e) {} }
      }
      ov.addEventListener('click', (e) => { if (e.target === ov) hide() })
      ov.querySelector('#hdcDetailClose').addEventListener('click', hide)
    }
    // 换英雄/关面板前停掉旧画布的 raf，避免泄漏
    if (_lastSpineCanvas) { try { window.spineHero && window.spineHero.stop(_lastSpineCanvas) } catch (e) {} }
    _lastSpineCanvas = null
    ov.querySelector('#hdcDetailBody').innerHTML = detailHTML(h)
    ov.style.display = 'flex'
    _lastSpineCanvas = document.getElementById('hdcSpine')
    _spineRetry = 0
    playHeroSpine(h)
    ov.querySelectorAll('.hdc-skinplay').forEach((btn) => {
      btn.addEventListener('click', () => playHeroSpine(h, btn.dataset.model))
    })
  }

  function buildUI() {
    const old = document.getElementById('heroDeckOverlay')
    if (old) old.remove()
    const el = document.createElement('div')
    el.id = 'heroDeckOverlay'
    el.style.cssText = 'position:fixed;inset:0;z-index:99995;display:none;flex-direction:column;color:#fff;' +
      "background:radial-gradient(1200px 600px at 50% -10%,#1d4066,#12283f 55%,#0b1826);"
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(255,215,107,.18);flex-wrap:wrap;background:rgba(6,12,22,.55);">
        <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(180deg,#8a63f0,#5f3dc4);display:flex;align-items:center;justify-content:center;font-size:1.2rem;box-shadow:0 2px 8px rgba(0,0,0,.4);">🎴</div>
        <div>
          <div style="font-size:1.05rem;font-weight:800;color:#ffd76b;">英雄图鉴 <span style="font-size:.66rem;color:rgba(255,255,255,.45);font-weight:400;">e9937</span></div>
          <div id="hdcCount" style="font-size:.7rem;color:rgba(255,255,255,.5);"></div>
        </div>
        <div style="flex:1"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <div style="position:relative;">
            <input id="hdcSearch" placeholder="🔍 搜索英雄/职业（支持拼音模型名）" style="width:250px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:.85rem;outline:none;">
          </div>
          <button id="hdcSort" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:.82rem;cursor:pointer;">排序</button>
          <button id="hdcQ" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:.82rem;cursor:pointer;">🎨 按品质</button>
          <button id="hdcClose" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:.82rem;cursor:pointer;">✕ 关闭</button>
        </div>
      </div>
      <div id="hdcGrid" style="flex:1;overflow-y:auto;padding:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:16px;justify-content:center;align-content:start;"></div>`
    document.body.appendChild(el)

    el.querySelector('#hdcClose').addEventListener('click', () => { el.style.display = 'none' })
    el.querySelector('#hdcSearch').addEventListener('input', (e) => { state.kw = e.target.value; renderGrid() })
    el.querySelector('#hdcSort').addEventListener('click', () => {
      state.sort = (state.sort + 1) % 3
      el.querySelector('#hdcSort').textContent = ['排序', '排序·名称', '排序·品质'][state.sort]
      renderGrid()
    })
    el.querySelector('#hdcQ').addEventListener('click', () => {
      state.q = (state.q + 1) % 5
      const names = { 0: '🎨 按品质', 1: '🟢 绿色', 2: '🔵 蓝色', 3: '🟣 紫色', 4: '🟡 金色' }
      el.querySelector('#hdcQ').textContent = names[state.q]
      renderGrid()
    })
    el.querySelector('#hdcGrid').addEventListener('click', (e) => {
      const card = e.target.closest('.hdc-card')
      if (!card) return
      const h = heroes.find((x) => String(x.id) === card.dataset.id)
      if (h) openDetail(h)
    })
  }

  window.openHeroDeck = async function () {
    const el = document.getElementById('heroDeckOverlay') || (buildUI(), document.getElementById('heroDeckOverlay'))
    el.style.display = 'flex'
    try {
      await getData()
      renderGrid()
    } catch (e) {
      document.getElementById('hdcGrid').innerHTML =
        `<div style="grid-column:1/-1;color:#f87171;padding:30px;text-align:center;">英雄数据加载失败：${esc(e.message || e)}<br><span style="color:rgba(255,255,255,.5);font-size:.8rem;">请先运行 scripts/sync-hero-deck.mjs（或在工具箱更新资源后重新同步）</span></div>`
    }
  }
})()
