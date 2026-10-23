// ============================================================
// 英雄 Spine 动画播放器
//   官方 Spine 3.8 Canvas 运行时（vendor/spine-core.js + spine-canvas.js）
//   资源：data/hero-spine/<folder>/ skeleton.json + atlas.txt + p*.png
//         （目录清单见 data/hero-spine/index.json，由 export-spine.mjs 维护；
//           完整资源集后续可托管 Gitee，届时设 window.__HERO_SPINE_BASE 指向远端即可）
//   移植自 TDS toolbox SpineViewer.vue 的核心（加载 + 包围盒居中 + idle 循环）
// 用法：spineHero.play(canvas, 'qiqi', { fitPadding: 0.9, onStatus: fn })
//       spineHero.stop(canvas)   // 离屏/重渲染前必须调用，停 raf + 解监听
// ============================================================
;(function () {
  let spinePromise = null
  const assetCache = {} // folder -> { skData, atlas }（骨架/图集跨卡片共享，避免重复 fetch+解析）
  const vbCache = {}    // folder@model -> { off, size }（按真实不透明像素测得的紧包围盒）
  const vbBoundsCache = {}  // 🔴 2026-10-21 folder@model -> 骨架包围盒（首次测量后复用，省一次动画采样）
  const vbFxCache = {}      // 🔴 2026-10-21 folder@model -> 排除特效骨的本体包围盒
  let playTokenSeq = 0  // 同一 canvas 连续 play 时，仅最后一次生效（按画布各自计时）

  function baseUrl() {
    // 资源 base 可被整体切换到远端（如 Gitee 托管的完整资源集）
    if (window.__HERO_SPINE_BASE) return window.__HERO_SPINE_BASE
    const p = location.pathname
    return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1)
  }
  // 🔴 2026-10-21 动画资源可单独指向「本地皮肤包解压目录」（桌面版离线秒开）；
  //    vendor/ 运行时脚本仍走 baseUrl()（站点），只有骨骼/图集/贴图走 assetBase()。
  function assetBase() {
    if (window.__HERO_SPINE_ASSET_BASE) return window.__HERO_SPINE_ASSET_BASE
    return baseUrl() + 'data/hero-spine/'
  }
  function ensureSpine() {
    if (window.spine) return Promise.resolve()
    if (spinePromise) return spinePromise
    const base = baseUrl()
    spinePromise = new Promise(function (resolve, reject) {
      // 🟢 2026-10-22 网络抖动兜底：脚本加载失败时清空在途 promise，让下一次 play 自动重试
      //   （此前一次失败会把 rejected promise 永久留在 spinePromise，刷新页面前运行时永远加载不上）
      const fail = function (w) { spinePromise = null; reject(new Error(w + ' 加载失败')) }
      const s1 = document.createElement('script')
      s1.src = base + 'vendor/spine-core.js'
      s1.onload = function () {
        const s2 = document.createElement('script')
        s2.src = base + 'vendor/spine-canvas.js'
        s2.onload = function () { resolve() }
        s2.onerror = function () { fail('spine-canvas') }
        document.body.appendChild(s2)
      }
      s1.onerror = function () { fail('spine-core') }
      document.body.appendChild(s1)
    })
    return spinePromise
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      const i = new Image()
      i.onload = function () { res(i) }
      i.onerror = function () { rej(new Error('img ' + src)) }
      i.src = src
    })
  }
  // 隐藏/恢复「特效骨」挂件：冰晶/光效(fx/*)会把包围盒撑大，使人物被算小、站偏
  function hideFxSlots(sk) {
    let n = 0
    // 🔴 2026-10-22 稳健识别特效：官方把所有特效附件放在 images/fx/ 路径下（3619 个），
    //   但命名有两种——'images/fx/aixin'（fx 前有斜杠）与 'fx/glow2_00004'（fx 在开头）。
    //   只按骨骼名匹配会漏掉后者（如小野脚下爱心），导致本体盒被特效撑大→角色变小/脚不沾地。
    //   故改为匹配「路径段 fx」（覆盖两种命名）；同时保留骨骼名匹配作为兜底。
    const fxSeg = /(^|\/)fx(\/|$)/i
    for (let i = 0; i < sk.slots.length; i++) {
      const s = sk.slots[i]
      if (!s.attachment) continue
      const bn = (s.bone && s.bone.data && s.bone.data.name) || ''
      const an = (s.attachment.name) || ''
      if (fxSeg.test(bn) || fxSeg.test(an) || /特效|texiao|guangxiao/i.test(bn)) { s._fxAtt = s.attachment; s.attachment = null; n++ }
    }
    return n
  }
  // 采样 idle 动画求 tight 包围盒（世界坐标）；hideFx=true 时排除特效骨，得到「人物本体」范围
  function computeBounds(spine, skData, animName, hideFx) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const off = new spine.Vector2(), sz = new spine.Vector2()
    const tmp = new spine.Skeleton(skData)
    const stt = new spine.AnimationState(new spine.AnimationStateData(skData))
    const merge = function (o, s) {
      if (!isFinite(o.x) || !isFinite(o.y) || !isFinite(s.x) || !isFinite(s.y) || s.x <= 0 || s.y <= 0) return
      minX = Math.min(minX, o.x); minY = Math.min(minY, o.y)
      maxX = Math.max(maxX, o.x + s.x); maxY = Math.max(maxY, o.y + s.y)
    }
    tmp.setToSetupPose(); if (hideFx) hideFxSlots(tmp); tmp.updateWorldTransform(); tmp.getBounds(off, sz); merge(off, sz)
    const anim = animName ? skData.findAnimation(animName) : null
    if (anim) {
      const dur = anim.duration || 1
      const n = Math.max(24, Math.ceil(dur * 30))
      for (let i = 0; i <= n; i++) {
        tmp.setToSetupPose(); stt.clearTracks(); stt.setAnimation(0, anim.name, false)
        stt.update((dur * i) / n); stt.apply(tmp); if (hideFx) hideFxSlots(tmp); tmp.updateWorldTransform(); tmp.getBounds(off, sz); merge(off, sz)
      }
    }
    return { off: new spine.Vector2(minX, minY), size: new spine.Vector2(maxX - minX, maxY - minY) }
  }

  // 按真实不透明像素测量紧凑包围盒（骨架 getBounds 会含大量空白附属/离屏附件，
  // 直接用会导致角色偏小且偏离中心）。把整块网格渲染到小画布，扫 alpha 求紧边界再换算回世界坐标。
  // 🔴 2026-10-22 升级为「idle 整周期采样取并集」：旧法只测传入骨架的当前单帧（调用方固定 t=0），
  //    而 idle 起始帧几乎无内容的模型（萌萌 bingdundun2 实测 t0 仅 38px 冰晶残影、t0.5 起角色才完整出现）
  // 会被测成极小包围盒 → 缩放爆炸 → 画成局部放大碎片（用户只见一小块绿影）。
  //    现逐帧渲染到同一块 320px 累积画布取 alpha 并集，一次扫描得到整周期可见范围。
  function measureVisualBounds(spine, skData, anim, vb, hideFx, hideIdx) {
    try {
      const sw = vb.size.x, sh = vb.size.y
      if (!(sw > 0 && sh > 0)) return null
      const N = 512
      const cx = vb.off.x + sw / 2, cy = vb.off.y + sh / 2
      const stt = new spine.AnimationState(new spine.AnimationStateData(skData))
      const dur = anim ? (anim.duration || 0) : 0
      const steps = Math.max(6, Math.ceil(dur * 12))
      // 🟢 2026-10-23 两遍测量：第一遍按「骨架整盒」定标——fx 附件会把整盒撑得极大
      //   （如后羿的火焰），可见内容被缩到几十像素，细线/半透明像素 alpha 低于阈值被漏掉，
      //   union 偏小 → 实时渲染放得太大、人物溢出画布（后羿半截身子被切）。
      //   第二遍按第一遍的 union 放大重测，精度足够。
      const pass = function (fitW, fitH) {
        const s = Math.min((N - 6) / fitW, (N - 6) / fitH)
        if (!(s > 0)) return null
        const oc = document.createElement('canvas')
        oc.width = N; oc.height = N
        const c2 = oc.getContext('2d', { willReadFrequently: true })
        const acc = new Uint8Array(N * N)
        for (let i = 0; i <= steps; i++) {
          const tmp = new spine.Skeleton(skData)
          tmp.setToSetupPose()
          if (anim) { stt.clearTracks(); stt.setAnimation(0, anim.name, false); stt.update((dur * i) / steps); stt.apply(tmp) }
          if (hideFx) hideFxSlots(tmp)
          if (hideIdx) { for (let k = 0; k < hideIdx.length; k++) { const _sl = tmp.slots[hideIdx[k]]; if (_sl) _sl.attachment = null } }
          tmp.updateWorldTransform()
          c2.clearRect(0, 0, N, N)
          c2.save()
          c2.translate(N / 2, N / 2)
          c2.scale(s, -s)
          c2.translate(-cx, -cy)
          const r2 = new spine.canvas.SkeletonRenderer(c2)
          r2.triangleRendering = true
          r2.draw(tmp)
          c2.restore()
          const data = c2.getImageData(0, 0, N, N).data
          for (let p = 3, o = 0; o < N * N; p += 4, o++) { if (data[p] > 24) acc[o] = 1 }
        }
        let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
        for (let y = 0; y < N; y++) {
          const row = y * N
          for (let x = 0; x < N; x++) {
            if (acc[row + x]) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }
        if (maxX < 0) return null
        const toWx = function (px) { return (px - N / 2) / s + cx }
        const toWy = function (py) { return -(py - N / 2) / s + cy }
        const wx1 = toWx(minX), wx2 = toWx(maxX + 1)
        const wy1 = toWy(maxY + 1), wy2 = toWy(minY)
        if (!(wx2 > wx1) || !(wy2 > wy1)) return null
        return { off: new spine.Vector2(wx1, wy1), size: new spine.Vector2(wx2 - wx1, wy2 - wy1) }
      }
      const r1 = pass(sw, sh)
      if (!r1) return null
      const r2 = pass(r1.size.x * 1.08, r1.size.y * 1.08)
      return r2 || r1
    } catch (e) { return null }
  }

  // 加载并解析 folder 的骨架资源（带缓存；失败返回 null，由调用方展示状态）
  // model：皮肤独立骨骼名（官方每个皮肤在英雄目录下有独立资源），有则读 models/<model>/ 子目录
  // pngCount：清单登记的贴图页数（p0..pN-1）；不传则逐个试到失败为止
  async function loadAssets(folder, pngCount, model) {
    const key = folder + '@' + (model || '')
    if (assetCache[key]) return assetCache[key]
    const base = assetBase() + folder + (model ? '/models/' + model : '') + '/'
    // 🔴 2026-10-20 并行加载：骨架/图集/贴图同时拉（原为串行逐个等 RTT，首次打开每英雄多等数秒）
    //    贴图仍保持「从 p0 起连续」语义：跳过缺失页之后的不连续页，与原逐页试错的截断行为一致
    const maxPages = pngCount > 0 ? pngCount : 9
    const results = await Promise.all([
      fetch(base + 'skeleton.json').then(function (r) { return r.json() }),
      fetch(base + 'atlas.txt').then(function (r) { return r.text() }),
      Promise.all(Array.from({ length: maxPages }, function (_, i) {
        return loadImage(base + 'p' + i + '.png').then(function (im) { return { i: i, im: im } }, function () { return null })
      })).then(function (rs) {
        const ok = rs.filter(Boolean).sort(function (a, b) { return a.i - b.i })
        const out = []
        for (let k = 0; k < ok.length; k++) { if (ok[k].i !== k) break; out.push(ok[k].im) }
        return out
      })
    ])
    const skeletonJson = results[0], atlasText = results[1], imgs = results[2]
    if (!imgs.length) throw new Error('无贴图')
    let pi = 0
    const atlas = new spine.TextureAtlas(atlasText, function () {
      const img = imgs[pi++] || imgs[0]
      return new spine.canvas.CanvasTexture(img)
    })
    const skData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonJson)
    const entry = { skData: skData, atlas: atlas }
    assetCache[key] = entry
    return entry
  }

  async function play(canvas, folder, opts) {
    opts = opts || {}
    const st = (canvas._spineSt = canvas._spineSt || {})
    st.playing = false
    if (st.raf) { cancelAnimationFrame(st.raf); st.raf = null }
    if (st._onResize) { window.removeEventListener('resize', st._onResize); st._onResize = null }
    const token = (st.token = ++playTokenSeq)
    const statusCb = opts.onStatus || function () {}
    try {
      if (!window.spine) statusCb('加载 Spine 运行时…')
      await ensureSpine()
    } catch (e) {
      statusCb('Spine 运行时加载失败')
      return
    }
    const spine = window.spine
    if (!spine) { statusCb('Spine 运行时缺失'); return }
    let assets
    try {
      assets = await loadAssets(folder, opts.pngs, opts.model)
    } catch (e) {
      // 🟢 2026-10-23 皮肤模型资源加载失败（404/网络/坏缓存）→ 自动回退基础模型重播，
      //   避免画布整块空白（用户反馈「十三姨·小野无动图」即此场景）
      if (opts.model) {
        statusCb('皮肤模型加载失败，回退基础模型')
        play(canvas, folder, Object.assign({}, opts, { model: '', pngs: (man && man.pngs) || 0, autoFxFallback: false }))
        return
      }
      statusCb('读取骨骼资源失败: ' + folder)
      return
    }
    if (token !== st.token) return // 已被后续 play 抢占，避免双 raf
    try {
      const skData = assets.skData
      // 🔴 2026-10-22 修复「萌萌只剩一团冰晶/部分模型身体不显示」：这类模型的插槽 setup attachmentName
      //    为空（身体附件只存在于皮肤里，官方导出器把 "0" 皮肤改名为 default），标准运行时对
      //    attachmentName 为空的插槽永远不从皮肤挂附件 → 身体从未被渲染过。
      //    这里把皮肤中每个插槽的第一个附件名回填到 SlotData.attachmentName：
      //    之后 setup 姿势、动画、computeBounds 全部自然生效（assetCache 缓存 skData，只补一次）。
      try {
        const skin0 = skData.defaultSkin || (skData.skins && skData.skins[0])
        const pairs = []
        if (skin0) {
          if (typeof skin0.getAttachments === 'function') {
            const es = skin0.getAttachments()
            for (const e of es) pairs.push({ slotIndex: e.slotIndex, name: e.name })
          } else if (skin0.attachments) {
            const idx = {}
            skData.slots.forEach(function (sd, i) { idx[sd.name] = i })
            for (const sn in skin0.attachments) {
              const m = skin0.attachments[sn]
              for (const an in m) { if (idx[sn] !== undefined) pairs.push({ slotIndex: idx[sn], name: an }) }
            }
          }
        }
        const done = {}
        for (const p of pairs) {
          const sd = skData.slots[p.slotIndex]
          if (sd && !sd.attachmentName && !done[p.slotIndex]) { sd.attachmentName = p.name; done[p.slotIndex] = 1 }
        }
      } catch (e) {}
      const skeleton = new spine.Skeleton(skData)
      skeleton.setToSetupPose()
      const state = new spine.AnimationState(new spine.AnimationStateData(skData))
      const renderer = new spine.canvas.SkeletonRenderer(canvas.getContext('2d'))
      renderer.triangleRendering = true
      const anims = skData.animations.map(function (a) { return a.name })
      const idle = anims.find(function (a) { return /idle/i.test(a) }) || anims[0]
      const animObj = idle ? skData.findAnimation(idle) : null
      // 🔴 2026-10-21 包围盒按模型缓存（首次测量后复用），避免每次打开都重复采样动画
      // 🟢 2026-10-22 hideFx：渲染与包围盒都剔除 images/fx/* 特效槽（图鉴详情等调用方按需开启）。
      //   普通播放器会把官方游戏里由引擎合成的特效附件原样画出来——大团爆炸/光斑，
      //   甚至是身体图的特效拷贝（如 yilidan 的 images/fx/1/a0000 → 画面出现"两个恶魔"）。
      //   隐藏后若骨架整体不可见（真身真在 fx 路径下的极少数模型），自动回退为不剔除。
      let fxHide = opts.hideFx ? [] : null
      if (fxHide) {
        const fxSeg = /(^|\/)fx(\/|$)/i
        skeleton.slots.forEach(function (sl, i) {
          const bn = (sl.bone && sl.bone.data && sl.bone.data.name) || ''
          const an = (sl.data && sl.data.attachmentName) || (sl.attachment && sl.attachment.name) || ''
          // 🟢 2026-10-23 槽位本身的名字也要查：皮肤模型（如骨弓 huarong）的 fx 槽 setup 为空、
          //   附件由动画挂上，启动时 an/bn 都不含 fx，只靠槽名（fx/bingyan/…）才认得出
          const sn = (sl.data && sl.data.name) || ''
          if (fxSeg.test(bn) || fxSeg.test(an) || fxSeg.test(sn) || /特效|texiao|guangxiao/i.test(bn)) fxHide.push(i)
        })
        if (!fxHide.length) fxHide = null
      }
      // 🟢 2026-10-23 渲染期槽位隐藏：如 yilidan/jietoubawang/duye 的 images/a0（半尺寸身体拷贝，
      //   游戏里是召唤分身），动画一挂就「两个身体叠一起」。调用方传槽位名数组，每帧清空。
      let slotHide = null
      if (opts.hideSlots && opts.hideSlots.length) {
        const nameIdx = {}
        skeleton.slots.forEach(function (sl, i) { nameIdx[sl.data.name] = i })
        slotHide = []
        opts.hideSlots.forEach(function (n) { if (nameIdx[n] !== undefined) slotHide.push(nameIdx[n]) })
        if (!slotHide.length) slotHide = null
      }
      const frameHide = (fxHide || slotHide) ? (fxHide || []).concat(slotHide || []) : null
      // 🟢 2026-10-23 同家族身体去重（通用规则，全模型自动生效）：
      //   官方骨架常带「半尺寸/残影拷贝」槽（images/a0 之于 images/a0000、images/idle/a0、槽位5…），
      //   游戏内由引擎按状态二选一，普通播放器全部画出 → 两个/三个身体叠一起。
      //   规则：非 fx 槽按附件名去尾号的「家族」分组，槽内最大附件面积 < 家族最大面积 60% 的槽隐藏
      //   （真身 vs 半尺寸拷贝 = 25% 命中；并列摆放的小特效彼此等大，不受影响）。
      let dedupeHide = null
      if (opts.dedupe) {
        try {
          const famBest = {}   // family -> { idx, area }
          const famMax = {}    // family -> 最大单附件面积
          const famSlots = {}  // family -> { slotIndex: { area, names:{} } }
          const skin0 = skData.defaultSkin || (skData.skins && skData.skins[0])
          const list = skin0 && skin0.getAttachments ? skin0.getAttachments() : []
          list.forEach(function (e) {
            const att = e.attachment
            if (!att || !att.width || !att.height) return
            const nm = e.name || ''
            if (/(^|\/)fx(\/|$)/i.test(nm)) return
            const f = nm.replace(/\d+$/, '')
            const area = att.width * att.height
            famSlots[f] = famSlots[f] || {}
            const rec = famSlots[f][e.slotIndex] || (famSlots[f][e.slotIndex] = { area: 0, names: {} })
            rec.area = Math.max(rec.area, area)
            rec.names[nm] = 1
            if (!famMax[f] || area > famMax[f]) famMax[f] = area
          })
          const hideSet = {}
          Object.keys(famSlots).forEach(function (f) {
            const entries = Object.keys(famSlots[f]).map(function (si) { return { si: Number(si), rec: famSlots[f][si] } })
            if (entries.length < 2) return
            // 主槽：家族内附件面积最大（并列取附件名更多的）
            entries.sort(function (a, b) { return (b.rec.area - a.rec.area) || (Object.keys(b.rec.names).length - Object.keys(a.rec.names).length) })
            const best = entries[0]
            const bestNames = new Set(Object.keys(best.rec.names))
            for (let i = 1; i < entries.length; i++) {
              const o = entries[i]
              // ① 半尺寸拷贝（真身 vs 残影分身）：面积 < 家族最大 60%
              if (o.rec.area < famMax[f] * 0.6) { hideSet[o.si] = 1; continue }
              // ② 等大同名孪生（如精灵球 images/idle/a0 与 images/idle/a0000：附件集完全相同、
              //    同样 512x512，游戏内按状态二选一）——附件名集合与主槽完全一致就隐藏
              const names = Object.keys(o.rec.names)
              if (names.length === bestNames.size && names.every(function (n) { return bestNames.has(n) })) hideSet[o.si] = 1
            }
          })
          const arr = Object.keys(hideSet).map(Number)
          if (arr.length) dedupeHide = arr
        } catch (e) {}
      }
      const frameHide2 = (dedupeHide && frameHide) ? frameHide.concat(dedupeHide) : (dedupeHide || frameHide)
      const vbKey = folder + '@' + (opts.model || '') + (fxHide ? '@nofx' : '') + (slotHide ? '@hs' : '')
      let vb = vbBoundsCache[vbKey]
      if (!vb) {
        vb = computeBounds(spine, skData, idle, !!fxHide)
        if (fxHide && !(vb.size.x > 0 && vb.size.y > 0)) { fxHide = null; vb = computeBounds(spine, skData, idle, false) }
        vbBoundsCache[vbKey] = vb
      }
      state.setAnimation(0, idle, true)
      state.update(0); state.apply(skeleton); skeleton.updateWorldTransform()

      // 真实不透明像素的紧包围盒（缓存）：修正骨架 getBounds 空白过多导致的偏小/偏心
      // 仅 opts.tight 时启用（详情大图用），避免改变战场小卡/图鉴既有观感
      // 🔴 2026-10-22 改为整周期采样（见 measureVisualBounds 注释），并缓存
      let vbVis = vb
      if (opts.tight) {
        vbVis = vbCache[vbKey]
        if (!vbVis) {
          // 🔴 2026-10-22 官方 1:1 复刻：整骨架联合盒（setup + idle 全周期采样），不做任何特效剔除。
          //   官方 SpineViewer.updateViewBounds 即此算法，靠随包 render-offsets.json 的逐模型
          //   scale/x/y 手调补偿特效撑盒与落台（已合并进 index[folder].modelOffsets）。
          //   index[folder].hideSlots 仍可对个别英雄做测量剔除兜底（渲染照常）。
          let hideIdx = null
          try {
            const _man = (typeof window !== 'undefined' && window.__heroSpineIndex) ? window.__heroSpineIndex[folder] : null
            const _model = opts.model || ''
            let _hs = _man && Array.isArray(_man.hideSlots) ? _man.hideSlots.slice() : null
            if (_man && _man.modelHideSlots && _man.modelHideSlots[_model] && Array.isArray(_man.modelHideSlots[_model])) {
              _hs = _hs ? _hs.concat(_man.modelHideSlots[_model]) : _man.modelHideSlots[_model].slice()
            }
            if (_hs && _hs.length) {
              const _names = {}
              skData.slots.forEach(function (sd, i) { _names[sd.name] = i })
              hideIdx = []
              for (const _n of _hs) { if (_names[_n] !== undefined) hideIdx.push(_names[_n]) }
              if (!hideIdx.length) hideIdx = null
            }
          } catch (e) {}
          if (opts.hideSlots && opts.hideSlots.length) {
            const _n2 = {}
            skData.slots.forEach(function (sd, i) { _n2[sd.name] = i })
            const _extra = []
            opts.hideSlots.forEach(function (n) { if (_n2[n] !== undefined) _extra.push(_n2[n]) })
            if (_extra.length) hideIdx = hideIdx ? hideIdx.concat(_extra) : _extra
          }
          if (dedupeHide && dedupeHide.length) hideIdx = hideIdx ? hideIdx.concat(dedupeHide) : dedupeHide.slice()
          vbVis = measureVisualBounds(spine, skData, animObj, vb, !!fxHide, hideIdx) || vb
          vbCache[vbKey] = vbVis
          try { window.__spineDbg = { folder: folder, model: opts.model || '', hideIdx: hideIdx, union: { w: +vbVis.size.x.toFixed(0), h: +vbVis.size.y.toFixed(0) }, chosen: 'union' } } catch (e) {}
        }
      }

      // 画布尺寸随容器 + dpr
      function fit() {
        const parent = canvas.parentElement
        const dpr = window.devicePixelRatio || 1
        const w = Math.max(1, Math.round((parent ? parent.clientWidth : 400) * dpr))
        const h = Math.max(1, Math.round((parent ? parent.clientHeight : 500) * dpr))
        if (canvas.width !== w) canvas.width = w
        if (canvas.height !== h) canvas.height = h
      }
      fit()
      window.addEventListener('resize', fit)
      st._onResize = fit

      statusCb('')
      st.playing = true
      st.anims = anims
      st.state = state
      st.skeleton = skeleton
      let last = performance.now()
      const tick = function (now) {
        if (!st.playing) return
        st.raf = requestAnimationFrame(tick)
        const dt = Math.min((now - last) / 1000, 0.1); last = now
        state.update(dt); state.apply(skeleton); skeleton.updateWorldTransform()
        if (frameHide2) { for (let i = 0; i < frameHide2.length; i++) { const _fs = skeleton.slots[frameHide2[i]]; if (_fs) _fs.attachment = null } }
        const ctx = canvas.getContext('2d')
        const w = canvas.width, h = canvas.height
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h)
        const sw = vbVis.size.x, sh = vbVis.size.y
        if (!(sw > 0 && sh > 0)) return
        const pad = (opts.fitPadding != null ? opts.fitPadding : 0.9)
        let fitScale = Math.min(w / sw, h / sh) * pad
        if (opts.fitByHeight) {
          // 统一视觉高度：以「可见高度 = 画布高 × pad」为基准缩放，宽度只做溢出保护。
          // 此前用 min(w/sw, h/sh) 会让偏宽的模型被整体压小，导致各卡角色大小不一。
          fitScale = Math.min((h / sh) * pad, (w * 0.96) / sw)
        }
        if (opts.scale != null && opts.scale > 0) fitScale *= opts.scale
        else if (window.__heroSpineIndex && folder && window.__heroSpineIndex[folder] && window.__heroSpineIndex[folder].scale > 0) fitScale *= window.__heroSpineIndex[folder].scale
        // 🔴 2026-10-22 官方 1:1：联合盒中心 + 官方 render-offsets 的世界单位 x/y 偏移后对准画布中心
        //   （官方 SpineViewer：cx = viewBounds.offset.x + sw/2 + ox; cy = ... + oy）。
        //   注：offsetX/offsetY 语义已从「画布比例」改为「世界单位」，与官方数据一致。
        const cx = vbVis.off.x + sw / 2 + (Number(opts.offsetX) || 0)
        const cy = vbVis.off.y + sh / 2 + (Number(opts.offsetY) || 0)
        ctx.save()
        if (opts.anchorFeet != null) {
          // 底边中点对齐锚点：横向居中、纵向落在石台面（战场小卡等旧调用方仍可用）
          ctx.translate(w / 2, h * opts.anchorFeet)
          ctx.scale(fitScale, -fitScale)
          ctx.translate(-(vbVis.off.x + sw / 2), -vbVis.off.y)
        } else {
          ctx.translate(w / 2, h / 2)
          ctx.scale(fitScale, -fitScale)
          ctx.translate(-cx, -cy)
        }
        renderer.draw(skeleton)
        ctx.restore()
      }
      st.raf = requestAnimationFrame(tick)
      // 🟢 2026-10-23 autoFxFallback：像素级静止检测——「有画面但完全静止」说明该模型的
      //   idle 只动画特效槽（如萌萌），剔 fx 后只剩静态身体 → 自动带特效重播一次。
      //   图鉴详情与主页英雄面板共用。失败/无内容不重播（保持现状）。
      if (opts.autoFxFallback && frameHide2 && frameHide2.length) {
        let lastSum = null, tried = false
        const t0 = Date.now()
        const fxPoll = function () {
          if (!st.playing || !document.body.contains(canvas)) return
          let px = 0, sum = 0
          try {
            const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
            for (let i = 3; i < d.length; i += 4) { if (d[i] > 30) { px++; sum = (sum + d[i] * 31 + i) % 99999991 } }
          } catch (e) {}
          if (px > 500) {
            if (!tried && lastSum !== null && lastSum === sum) {
              tried = true
              st.playing = false
              if (st.raf) { cancelAnimationFrame(st.raf); st.raf = null }
              play(canvas, folder, Object.assign({}, opts, { hideFx: false, autoFxFallback: false }))
              return
            }
            lastSum = sum
          }
          if (Date.now() - t0 < 12000) setTimeout(fxPoll, 500)
        }
        setTimeout(fxPoll, 1200)
      }
    } catch (e) {
      statusCb('解析失败: ' + (e && e.message))
    }
  }

  function stop(canvas) {
    if (canvas && canvas._spineSt) {
      const st = canvas._spineSt
      st.playing = false
      if (st.raf) { cancelAnimationFrame(st.raf); st.raf = null }
      if (st._onResize) { window.removeEventListener('resize', st._onResize); st._onResize = null }
    }
  }

  // 🔴 2026-10-21 预热接口：提前把 Spine 运行时 + 某模型的骨骼/图集/贴图拉进缓存，
  //    弹窗真正 play 时直接命中缓存，首次打开不用干等（loadAssets 内部按 folder@model 缓存）。
  function warm() {
    try { ensureSpine() } catch (e) {}
  }
  function preload(folder, opts) {
    opts = opts || {}
    if (!folder) return
    try {
      ensureSpine().then(function () {
        return loadAssets(folder, opts.pngs, opts.model)
      }).catch(function () {})
    } catch (e) {}
  }
  // 🔴 2026-10-21 空闲批量预热：把清单内所有模型（默认只拉各英雄默认模型；includeSkins=true 连皮肤模型一起）
  //    逐个在浏览器空闲时段拉进缓存（HTTP/SW 缓存 + 内存 assetCache），进度写入 localStorage 断点续传；
  //    省流量模式 / 2g3g 网络自动跳过；失败也标记，避免反复重试拖垮网络。
  const PL_KEY = 'tfjl_spine_preload_done_v1'
  const _pl = { running: false, abort: false, done: {}, total: 0 }
  function _plLoad() { try { return JSON.parse(localStorage.getItem(PL_KEY) || '{}') || {} } catch (e) { return {} } }
  function _plSave() { try { localStorage.setItem(PL_KEY, JSON.stringify(_pl.done)) } catch (e) {} }
  function _plIdle(fn) {
    if (window.requestIdleCallback) return window.requestIdleCallback(fn, { timeout: 2500 })
    return setTimeout(fn, 80)
  }
  async function preloadAll(opts) {
    opts = opts || {}
    if (_pl.running) return
    try {
      const c = navigator.connection
      if (c && (c.saveData || /(^|-)2g$|3g/.test(c.effectiveType || ''))) return
    } catch (e) {}
    if (!window.__heroSpineIndex) {
      try {
        const p = location.pathname
        const b = p.endsWith('/') ? p : (p.lastIndexOf('/') >= 0 ? p.slice(0, p.lastIndexOf('/') + 1) : '/')
        window.__heroSpineIndex = await (await fetch(assetBase() + 'index.json')).json()
        } catch (e) { return }
        }
    const idx = window.__heroSpineIndex || {}
    const jobs = []
    Object.keys(idx).forEach(function (f) {
      const e = idx[f] || {}
      jobs.push({ folder: f, model: e.model || '', pngs: e.pngs || 0, key: f + '@' + (e.model || '') })
      if (opts.includeSkins) {
        Object.keys(e.models || {}).forEach(function (sn) {
          const m = e.models[sn]
          if (!m) return
          jobs.push({ folder: f, model: m, pngs: (e.modelPngs && e.modelPngs[m]) || 0, key: f + '@' + m })
        })
      }
    })
    _pl.done = _plLoad()
    const pend = jobs.filter(function (j) { return !_pl.done[j.key] })
    _pl.total = jobs.length
    if (!pend.length) return
    _pl.running = true
    _pl.abort = false
    try { await ensureSpine() } catch (e) {}
    for (let i = 0; i < pend.length; i++) {
      if (_pl.abort) break
      await new Promise(function (res) { _plIdle(function () { res() }) })
      const j = pend[i]
      try { await loadAssets(j.folder, j.pngs, j.model) } catch (e) {}
      _pl.done[j.key] = 1
      if (i % 4 === 0) _plSave()
    }
    _plSave()
    _pl.running = false
  }
  function preloadStop() { _pl.abort = true }
  function preloadReset() { try { localStorage.removeItem(PL_KEY) } catch (e) {} _pl.done = {} }
  function preloadStatus() {
    return { running: _pl.running, done: Object.keys(_pl.done || {}).length, total: _pl.total }
  }
  // 🔴 2026-10-21 统计：默认模型 / 皮肤模型 各拉了多少（用于菜单与诊断页展示）
  function preloadStats() {
    const idx = window.__heroSpineIndex || {}
    const done = _plLoad()
    let base = 0, baseDone = 0, skin = 0, skinDone = 0
    Object.keys(idx).forEach(function (f) {
      const e = idx[f] || {}
      base++; if (done[f + '@' + (e.model || '')]) baseDone++
      Object.keys(e.models || {}).forEach(function (sn) {
        const m = e.models[sn]
        if (!m) return
        skin++; if (done[f + '@' + m]) skinDone++
      })
    })
    return { base: base, baseDone: baseDone, skin: skin, skinDone: skinDone, running: _pl.running }
  }
  // 🔍 调试测量（2026-10-22）：逐槽单独渲染测包围盒 + 中心密度，用于判定「巨型空心光环」槽。
  //   返回 { full:{w,h}, slots:[{name,w,h,area,fill,centerFill}] }；供审计工具/排查用，不影响渲染。
  async function dbgMeasure(folder, model) {
    try {
      const man = (window.__heroSpineIndex || {})[folder] || {}
      const pngs = (man.modelPngs && man.modelPngs[model]) || man.pngs || 0
      const assets = await loadAssets(folder, pngs, model)
      const skData = assets.skData
      const anims = skData.animations.map(function (a) { return a.name })
      const idleName = anims.find(function (a) { return /idle/i.test(a) }) || anims[0]
      const idle = idleName ? skData.findAnimation(idleName) : null
      const vb = computeBounds(spine, skData, idleName, false)
      if (!(vb.size.x > 0 && vb.size.y > 0)) return { err: 'no-bounds' }
      const N = 200
      const sw = vb.size.x, sh = vb.size.y
      const s = Math.min((N - 6) / sw, (N - 6) / sh)
      const oc = document.createElement('canvas'); oc.width = N; oc.height = N
      const c2 = oc.getContext('2d', { willReadFrequently: true })
      const cx = vb.off.x + sw / 2, cy = vb.off.y + sh / 2
      const stt = new spine.AnimationState(new spine.AnimationStateData(skData))
      const dur = idle ? (idle.duration || 0) : 0
      const times = dur > 0 ? [0, dur / 3, (2 * dur) / 3] : [0]
      const boxes = skData.slots.map(function () { return null })
      const r2 = new spine.canvas.SkeletonRenderer(c2)
      r2.triangleRendering = true
      for (const t of times) {
        const sk = new spine.Skeleton(skData)
        sk.setToSetupPose()
        if (idle) { stt.clearTracks(); stt.setAnimation(0, idle.name, false); stt.update(t); stt.apply(sk) }
        const atts = sk.slots.map(function (sl) { return sl.attachment })
        for (let i = 0; i < sk.slots.length; i++) {
          if (!atts[i]) continue
          for (let j = 0; j < sk.slots.length; j++) sk.slots[j].attachment = j === i ? atts[j] : null
          sk.updateWorldTransform()
          c2.clearRect(0, 0, N, N)
          c2.save(); c2.translate(N / 2, N / 2); c2.scale(s, -s); c2.translate(-cx, -cy)
          r2.draw(sk); c2.restore()
          const d = c2.getImageData(0, 0, N, N).data
          let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1
          for (let y = 0; y < N; y++) { const row = y * N; for (let x = 0; x < N; x++) { if (d[(row + x) * 4 + 3] > 24) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y } } }
          if (mxx < 0) continue
          const w = mxx - mnx + 1, h = mxy - mny + 1
          let cnt = 0, cc = 0, mid = 0
          const wx1 = mnx + w * 0.32, wx2 = mnx + w * 0.68, wy1 = mny + h * 0.32, wy2 = mny + h * 0.68
          for (let y = mny; y <= mxy; y++) { const row = y * N; for (let x = mnx; x <= mxx; x++) { const a = d[(row + x) * 4 + 3]; if (a > 24) { cnt++; if (a < 220) mid++; if (x >= wx1 && x <= wx2 && y >= wy1 && y <= wy2) cc++ } } }
          const prev = boxes[i]
          const b = { name: skData.slots[i].name, w: w, h: h, area: w * h, fill: +(cnt / (w * h)).toFixed(2), centerFill: +(cc / Math.max(1, (wx2 - wx1) * (wy2 - wy1))).toFixed(2), midAlpha: +(mid / Math.max(1, cnt)).toFixed(2) }
          boxes[i] = (!prev || b.area > prev.area) ? b : prev
        }
      }
      return { full: { w: +vb.size.x.toFixed(0), h: +vb.size.y.toFixed(0) }, slots: boxes.filter(Boolean) }
    } catch (e) { return { err: String(e) } }
  }
  window.spineHero = { play: play, stop: stop, warm: warm, preload: preload, preloadAll: preloadAll, preloadStop: preloadStop, preloadReset: preloadReset, preloadStatus: preloadStatus, preloadStats: preloadStats, __dbgMeasure: dbgMeasure }
})()
