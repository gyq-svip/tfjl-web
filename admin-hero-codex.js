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
    const UI = baseUrl() + 'data/hero-deck/ui/'
    const n = fuseCount(h)
    // 品质配色盾牌（等级/阶段数字）
    const shield = (num, sz) => `<span style="display:inline-flex;align-items:center;justify-content:center;flex:none;
      width:${sz}px;height:${Math.round(sz * 1.14)}px;clip-path:polygon(50% 100%,100% 74%,100% 10%,0 10%,0 74%);
      background:linear-gradient(180deg,${Q.c1},${Q.c2});box-shadow:0 1px 3px rgba(0,0,0,.45);color:#fff;font-weight:800;
      font-size:${Math.round(sz * 0.44)}px;text-shadow:0 1px 2px rgba(0,0,0,.6);">${num}</span>`
    // 升级预览：阶段 > 1 的解锁项（天赋名优先，退回被动档位文案）
    const tiers = (h.tiers || []).filter(t => Number(t.level) > 1).map(t => `
      <div style="display:flex;gap:9px;align-items:flex-start;padding:6px 8px;margin-bottom:5px;background:rgba(255,255,255,.06);border-radius:7px;">
        ${shield(t.level, 26)}
        <div style="flex:1;font-size:.78rem;line-height:1.5;color:rgba(255,255,255,.85);">
          <b style="color:#ffe9b8;">${esc(t.talentName || '阶段 ' + t.level)}</b>：${esc(t.talentDesc || t.passiveFull || t.passiveInitial || '')}
        </div>
      </div>`).join('')
    const skins = (form.skins || []).filter(s => s.model).map(s => `
      <button class="hdc-skinplay" data-model="${esc(s.model)}" style="display:flex;gap:8px;align-items:center;width:100%;padding:6px 8px;margin-bottom:4px;border:none;border-radius:7px;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;text-align:left;">
        ${s.hasPortrait ? portraitHTML(s, 40) : ''}
        <span style="font-size:.78rem;color:#ffe9b8;">${esc(s.name)}</span>
      </button>`).join('')
    const attrRow = (ico, k, v) => `<div style="display:flex;gap:8px;align-items:center;padding:5px 8px;margin-bottom:4px;background:rgba(255,255,255,.05);border-radius:7px;">
      <span style="flex:none;width:22px;text-align:center;">${ico}</span>
      <span style="flex:none;width:52px;color:rgba(255,255,255,.55);font-size:.76rem;">${k}</span>
      <span style="flex:1;font-size:.8rem;color:rgba(255,255,255,.9);">${v}</span></div>`
    return `
      <div style="position:relative;width:992px;height:560px;border-radius:16px;overflow:hidden;background:#0e1c30 url('${UI}hero-detail-bg.png') center/cover no-repeat;box-shadow:0 10px 40px rgba(0,0,0,.6);">
        <button id="hdcDetailClose" style="position:absolute;top:10px;right:12px;z-index:30;background:rgba(0,0,0,.35);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:1rem;">✕</button>
        <div style="position:absolute;inset:0;z-index:2;">
          <canvas id="hdcSpine" style="width:100%;height:100%;display:block;"></canvas>
          <img src="${UI}hero-ground-shadow.png" alt="" style="position:absolute;left:50%;top:76%;transform:translate(-50%,-50%);width:300px;opacity:.55;pointer-events:none;">
        </div>
        <div id="hdcSpineFallback" style="position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none;">${portraitHTML(h, 200)}</div>
        <div id="hdcSpineStatus" style="position:absolute;left:14px;bottom:56px;z-index:20;display:none;font-size:.7rem;color:rgba(255,255,255,.65);background:rgba(0,0,0,.4);padding:2px 8px;border-radius:6px;"></div>
        <div style="position:absolute;left:16px;top:12px;z-index:10;width:340px;display:flex;flex-direction:column;gap:9px;">
          <div style="pointer-events:none;">
            <div style="position:relative;display:inline-block;min-width:250px;padding:10px 18px 8px 52px;clip-path:polygon(0 0,100% 0,94% 100%,0 100%);background:linear-gradient(180deg,#ffc63f,#e89a12);box-shadow:0 2px 8px rgba(0,0,0,.4);">
              <span style="position:absolute;left:-4px;top:50%;transform:translateY(-50%);">${shield(n, 40)}</span>
              <div style="font-size:1.35rem;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(140,60,0,.55),0 0 6px rgba(0,0,0,.35);">${esc(h.name)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:7px;margin-top:7px;">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#3b4b66,#1c2637);border:2px solid #d9a441;font-size:.95rem;">${occ[1]}</span>
              <b style="font-size:.9rem;text-shadow:0 1px 2px rgba(0,0,0,.6);">${occ[0]}</b>
              ${h.heroDesc ? `<span style="font-size:.8rem;color:#dbe7ff;text-shadow:0 1px 2px rgba(0,0,0,.6);">${esc(h.heroDesc)}</span>` : ''}
            </div>
          </div>
          ${h.skillDesc ? `<div style="pointer-events:none;background:linear-gradient(180deg,rgba(38,80,150,.88),rgba(22,48,96,.88));border:1px solid rgba(120,180,255,.35);border-radius:9px;padding:9px 12px;">
            <span style="float:left;width:20px;height:20px;margin-right:8px;border:2px solid #9fd0ff;border-radius:4px;position:relative;"><i style="position:absolute;inset:4px;background:#9fd0ff;clip-path:polygon(0 0,100% 50%,0 100%);"></i></span>
            <div style="overflow:hidden;font-size:.82rem;line-height:1.55;color:#eaf2ff;text-shadow:0 1px 2px rgba(0,0,0,.5);">${esc(h.skillDesc)}</div>
          </div>` : ''}
          ${(h.passiveDesc || h.passiveDesc2) ? `<div style="pointer-events:none;background:linear-gradient(180deg,rgba(24,52,94,.88),rgba(14,32,64,.88));border:1px solid rgba(120,180,255,.3);border-radius:9px;padding:9px 12px;">
            ${h.passiveDesc ? `<div style="display:flex;gap:8px;margin-bottom:6px;"><img src="${UI}star-initial.png" style="flex:none;width:20px;height:20px;" alt=""><div style="font-size:.8rem;line-height:1.5;color:#eaf2ff;">初始被动 ${esc(h.passiveDesc)}</div></div>` : ''}
            ${h.passiveDesc2 ? `<div style="display:flex;gap:8px;"><img src="${UI}star-full.png" style="flex:none;width:20px;height:20px;" alt=""><div style="font-size:.8rem;line-height:1.5;color:#eaf2ff;">满星被动 ${esc(h.passiveDesc2)}</div></div>` : ''}
          </div>` : ''}
        </div>
        <div style="position:absolute;right:14px;top:14px;bottom:64px;z-index:10;width:322px;display:flex;flex-direction:column;background:rgba(10,22,44,.92);border:1px solid rgba(120,180,255,.35);border-radius:11px;overflow:hidden;">
          <div id="hdcTabs" style="display:flex;flex:none;">
            <button class="hdc-tab is-on" data-tab="attr" style="flex:1;padding:9px 0;border:none;cursor:pointer;font-size:.85rem;font-weight:700;color:#fff;background:linear-gradient(180deg,#2f6fd6,#2456ad);">属性详情</button>
            <button class="hdc-tab" data-tab="up" style="flex:1;padding:9px 0;border:none;cursor:pointer;font-size:.85rem;font-weight:700;color:rgba(255,255,255,.65);background:rgba(255,255,255,.06);">升级预览</button>
          </div>
          <div id="hdcTabAttr" style="flex:1;overflow-y:auto;padding:10px;">
            ${attrRow(occ[1], '职业', occ[0])}
            ${h.heroDesc ? attrRow('🎯', '定位', esc(h.heroDesc.replace(/^定位[：:]\s*/, ''))) : ''}
            ${attrRow('💎', '品质', Q.name + '品质')}
            ${attrRow('🔗', '融合', n + ' 段')}
            ${(form.skins || []).filter(s => s.model).length ? attrRow('🎽', '皮肤', (form.skins || []).filter(s => s.model).length + ' 款可切换') : ''}
            ${h.heroDesc ? attrRow('📖', '图鉴', esc(h.heroDesc)) : ''}
          </div>
          <div id="hdcTabUp" style="flex:1;display:none;overflow-y:auto;padding:10px;">
            ${tiers || '<div style="color:rgba(255,255,255,.5);font-size:.8rem;padding:10px;">暂无升级阶段数据</div>'}
          </div>
        </div>
        <div style="position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:10;display:flex;gap:16px;">
          <button id="hdcSkinBtn" title="切换皮肤" style="width:46px;height:46px;border-radius:50%;border:2px solid #d9a441;background:radial-gradient(circle at 35% 30%,#3b4b66,#1c2637);cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <img src="${UI}skin.png" style="width:26px;height:26px;" alt="皮肤">
          </button>
          <button id="hdcAnimBtn" title="切换动画（idle / attack）" style="width:46px;height:46px;border-radius:50%;border:2px solid #d9a441;background:radial-gradient(circle at 35% 30%,#3b4b66,#1c2637);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffd76b;font-size:1.05rem;font-weight:800;">▶</button>
        </div>
        <div id="hdcSkinPop" style="display:none;position:absolute;right:14px;bottom:66px;z-index:25;width:300px;max-height:300px;overflow-y:auto;background:rgba(10,22,44,.96);border:1px solid rgba(120,180,255,.4);border-radius:10px;padding:8px;">
          <div style="font-size:.78rem;color:#ffd76b;font-weight:700;margin-bottom:6px;">选择皮肤</div>
          <button class="hdc-skinplay" data-model="" style="display:flex;gap:8px;align-items:center;width:100%;padding:6px 8px;margin-bottom:4px;border:none;border-radius:7px;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;text-align:left;">
            <span style="font-size:.78rem;color:#ffe9b8;">默认 · ${esc(h.name)}</span>
          </button>
          ${skins}
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
  function playHeroSpine(h, model, noHideFx) {
    const canvas = document.getElementById('hdcSpine')
    const fb = document.getElementById('hdcSpineFallback')
    const st = document.getElementById('hdcSpineStatus')
    if (!canvas) return
    if (fb) fb.style.display = 'flex'
    if (st) { st.style.display = 'block'; st.textContent = '加载动画…' }
    spineIndex().then((idx) => {
      const man = (window.spineHero && h.modelFolder) ? idx[h.modelFolder] : null
      if (!man) throw new Error('no-spine')
      // 模型选择：皮肤指定 > snapshot 的 defaultModel（每英雄权威）> index 默认。
      // 不能直接用 index.model——多英雄共用目录时（jingling 放了 6 个精灵）那是别的英雄的模型。
      const useModel = model || h.defaultModel || man.model || ''
      const pngs = useModel ? ((man.modelPngs || {})[useModel] || 0) : (man.pngs || 0)
      const moff = (man.modelOffsets && (man.modelOffsets[useModel] || man.modelOffsets[man.model])) || {}
      window.spineHero.play(canvas, h.modelFolder, {
        model: useModel || undefined,
        pngs: pngs,
        tight: true,
        hideFx: !noHideFx,
        dedupe: true,
        // 🟢 统一观感：所有模型按「可见高度」归一化到同一档。
        //   官方 render-offsets 的 scale 是为「特效撑大包围盒」做补偿的（我们不剔特效时必须套），
        //   而图鉴已剔除 fx，再套会导致 200/161/128/113 这种参差；官方 x/y 居中偏移仍然保留。
        fitByHeight: true,
        fitPadding: 0.65,
        anchorFeet: 0.76,
        // 不套官方 x/y 偏移：那是给「特效撑大包围盒 + 官方 scale」做补偿的；
        // tight 包围盒（已剔 fx）本身居中，再偏移反而歪（蛇女/炸弹/虎弓偏移的来源）
        hideSlots: (man.hideSlots || []).concat((man.modelHideSlots || {})[useModel] || []),
        onStatus: (s) => {
          const el = document.getElementById('hdcSpineStatus')
          if (!el) return
          // 运行时/资源加载失败自动重试（网络抖动兜底，最多 2 次）
          if (s && /失败/.test(s) && _spineRetry < 2) {
            _spineRetry++
            el.style.display = 'block'
            el.textContent = s + '，自动重试 ' + _spineRetry + '/2…'
            setTimeout(() => { if (document.body.contains(canvas)) playHeroSpine(h, model, noHideFx) }, 1500)
            return
          }
          if (s) { el.style.display = 'block'; el.textContent = s } else { el.style.display = 'none'; el.textContent = '' }
        }
      })
      // 按实际像素判断「画出来了没有 + 动没动」：
      // ① 有些模型（如后羿）idle 前几秒角色尚未出场 → 立绘保持到画布真的有内容为止；
      // ② 有些模型（如萌萌 bingdundun2）idle 只动画特效槽，剔 fx 后完全静止
      //    → 检测到「有画面但像素级静止」自动带特效重播（fx 即动画，放弃隐藏）。
      const t0 = Date.now()
      let lastSum = null, fxTried = !noHideFx
      const poll = () => {
        if (!document.body.contains(canvas)) return
        let px = 0, sum = 0
        try {
          const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
          for (let i = 3; i < d.length; i += 4) { if (d[i] > 30) { px++; sum = (sum + d[i] * 31 + i) % 99999991 } }
        } catch (e) {}
        if (px > 500) {
          _spineRetry = 0
          if (fxTried && lastSum !== null && lastSum === sum) {
            fxTried = false
            if (st) { st.style.display = 'block'; st.textContent = '特效即动画，切换为带特效播放…' }
            setTimeout(function () { if (document.body.contains(canvas)) playHeroSpine(h, model, true) }, 200)
            return
          }
          lastSum = sum
          if (fb) fb.style.display = 'none'
        }
        if (Date.now() - t0 > 15000 && px <= 500) { if (st) { st.style.display = 'block'; st.textContent = '动画暂未呈现，已显示立绘' } return }
        setTimeout(poll, 500)
      }
      poll()
    }).catch(() => {
      if (fb) fb.style.display = 'flex'
      if (st) st.style.display = 'none'
    })
  }

  function openDetail(h) {
    let ov = document.getElementById('hdcDetail')
    const hide = () => {
      if (ov) ov.style.display = 'none'
      if (_lastSpineCanvas) { try { window.spineHero && window.spineHero.stop(_lastSpineCanvas) } catch (e) {} }
    }
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'hdcDetail'
      ov.style.cssText = 'position:fixed;inset:0;z-index:99997;background:rgba(4,8,14,.8);display:none;align-items:center;justify-content:center;padding:12px;'
      ov.innerHTML = '<div id="hdcDetailBody"></div>'
      document.body.appendChild(ov)
      ov.addEventListener('click', (e) => { if (e.target === ov) hide() })
    }
    // 换英雄/关面板前停掉旧画布的 raf，避免泄漏
    if (_lastSpineCanvas) { try { window.spineHero && window.spineHero.stop(_lastSpineCanvas) } catch (e) {} }
    _lastSpineCanvas = null
    ov.querySelector('#hdcDetailBody').innerHTML = detailHTML(h)
    ov.style.display = 'flex'
    ov.querySelector('#hdcDetailClose').addEventListener('click', hide)
    _lastSpineCanvas = document.getElementById('hdcSpine')
    _spineRetry = 0
    playHeroSpine(h)
    // 页签切换：属性详情 / 升级预览
    const tabs = ov.querySelectorAll('.hdc-tab')
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          const on = t === tab
          t.classList.toggle('is-on', on)
          t.style.color = on ? '#fff' : 'rgba(255,255,255,.65)'
          t.style.background = on ? 'linear-gradient(180deg,#2f6fd6,#2456ad)' : 'rgba(255,255,255,.06)'
        })
        const up = tab.dataset.tab === 'up'
        ov.querySelector('#hdcTabAttr').style.display = up ? 'none' : 'block'
        ov.querySelector('#hdcTabUp').style.display = up ? 'block' : 'none'
      })
    })
    // 皮肤弹层：列出默认 + 各皮肤，点击切模型
    const pop = ov.querySelector('#hdcSkinPop')
    ov.querySelector('#hdcSkinBtn').addEventListener('click', () => {
      pop.style.display = pop.style.display === 'block' ? 'none' : 'block'
    })
    ov.querySelectorAll('.hdc-skinplay').forEach((btn) => {
      btn.addEventListener('click', () => {
        playHeroSpine(h, btn.dataset.model || undefined)
        pop.style.display = 'none'
      })
    })
    // 动画切换：idle / attack / … 循环
    const animBtn = ov.querySelector('#hdcAnimBtn')
    animBtn.addEventListener('click', () => {
      const st = _lastSpineCanvas && _lastSpineCanvas._spineSt
      if (!st || !st.anims || !st.anims.length || !st.state) return
      st._animIdx = ((st._animIdx == null ? -1 : st._animIdx) + 1) % st.anims.length
      st.state.setAnimation(0, st.anims[st._animIdx], true)
      animBtn.textContent = st.anims[st._animIdx] === 'idle' ? '▶' : '⚔'
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
