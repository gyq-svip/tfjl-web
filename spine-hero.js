// ============================================================
// 英雄 Spine 动画播放器
//   官方 Spine 3.8 Canvas 运行时（vendor/spine-core.js + spine-canvas.js）
//   资源：data/hero-spine/<folder>/ skeleton.json + atlas.txt + p*.png
//         （目录清单见 data/hero-spine/index.json，由 export-spine.mjs 维护；
//           完整资源集后续可托管 Gitee，届时设 window.__HERO_SPINE_BASE 指向远端即可）
//   核心能力：资源加载 + 包围盒居中 + idle 循环（基于 Spine 官方运行时实现）
// 用法：spineHero.play(canvas, 'qiqi', { fitPadding: 0.9, onStatus: fn })
//       spineHero.stop(canvas)   // 离屏/重渲染前必须调用，停 raf + 解监听
// ============================================================
;(function () {
  let spinePromise = null
  const assetCache = {} // folder -> { skData, atlas }（骨架/图集跨卡片共享，避免重复 fetch+解析）
  // 🔴 2026-10-24 内存上限（LRU）：原实现 assetCache 只增不减、永不释放。
  //    每个模型常驻「骨架数据 + 图集 + 全部已解码贴图位图」（单模型 2~3MB PNG → 解码后可达数 MB~十几 MB），
  //    预热/逐个打开 98 个英雄后内存能涨到数百 MB~GB 级 → 页面卡顿、浏览器丢弃其它图片解码缓存，
  //    表现为「静态皮肤加载不出来 / 切换不丝滑」。改为保留最近使用的 N 个模型，超出释放最旧的。
  //    释放只删缓存引用，正在播放的 entry 由闭包持有，不受影响（重开该模型时从 HTTP/SW 缓存重取）。
  const ASSET_CACHE_MAX = 8
  const _assetCacheOrder = []
  function _assetCacheTrim(key) {
    try {
      const i = _assetCacheOrder.indexOf(key)
      if (i >= 0) _assetCacheOrder.splice(i, 1)
      _assetCacheOrder.push(key)
      while (_assetCacheOrder.length > ASSET_CACHE_MAX) {
        const old = _assetCacheOrder.shift()
        if (old === key) continue
        delete assetCache[old]
      }
    } catch (e) {}
  }
  const vbCache = {}    // folder@model -> { off, size }（按真实不透明像素测得的紧包围盒）
  const vbBoundsCache = {}  // 🔴 2026-10-21 folder@model -> 骨架包围盒（首次测量后复用，省一次动画采样）
  const vbFxCache = {}      // 🔴 2026-10-21 folder@model -> 排除特效骨的本体包围盒
  // 🔴 2026-10-24 hideSlots 槽名匹配：官方骨架槽名常为「路径式」（如 dadaoguang/dadaoguang_00012、
  //    images/a0），精确匹配 token 会漏掉。改为：精确匹配 或 以 token + 分隔符(/或_) 开头的槽名。
  //    既兼容既有精确写法，又能命中路径式/带帧号后缀的槽名，避免「该藏的没藏掉 → 重影/撑盒」。
  function slotMatches(token, name) {
    if (name === token) return true
    if (name.indexOf(token + '/') === 0) return true
    if (name.indexOf(token + '_') === 0) return true
    return false
  }
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
    // 🔴 2026-10-24 补强：部分模型特效不走 fx/ 路径，而是「附件叶名以 fx 开头」——fxg01 光环、
    //   fxfire 火焰、FX1~7、fxsm_*、fx1/fx2…（全量扫描 373 个骨架确认：以此开头的槽/附件全部是
    //   特效，无身体件）。这类特效同样撑大包围盒（魔精灵·传国玉玺 fxg 光环把盒子撑高 ~45%，
    //   玉玺被算小 + 偏离中心悬空）。
    const fxSeg = /(^|\/)fx(\/|$)/i
    const fxLeaf = /(^|\/)fx/i
    for (let i = 0; i < sk.slots.length; i++) {
      const s = sk.slots[i]
      if (!s.attachment) continue
      const bn = (s.bone && s.bone.data && s.bone.data.name) || ''
      const an = (s.attachment.name) || ''
      if (fxSeg.test(bn) || fxSeg.test(an) || fxLeaf.test(an) || /特效|texiao|guangxiao/i.test(bn)) { s._fxAtt = s.attachment; s.attachment = null; n++ }
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
  function measureVisualBounds(spine, skData, anim, vb, hideFx, hideIdx, liveBounds) {
    try {
      const sw = vb.size.x, sh = vb.size.y
      if (!(sw > 0 && sh > 0)) return null
      const N = 512
      // 🔴 2026-10-24 定标「中心」必须落在真实身体盒 liveBounds 上，而非 vb 盒中心：
      //   vb 含大量空槽 extent（如死神 fashi：vb=227×344 而身体仅 184×299 且偏心），若以 vb 中心定标，
      //   身体在 512 扫描画布内偏移→被裁→紧盒低估（→角色偏大/头顶贴边/站偏）。故以身体盒中心定标，
      //   窗口尺寸取 ≥ 身体（vb 兜底），保证身体居中且完整落在画布内不被裁。
      let cx, cy, winW, winH
      if (liveBounds && liveBounds.w > 0 && liveBounds.h > 0) {
        cx = liveBounds.offX + liveBounds.w / 2
        cy = liveBounds.offY + liveBounds.h / 2
        winW = Math.max(vb.size.x, liveBounds.w)
        winH = Math.max(vb.size.y, liveBounds.h)
      } else {
        cx = vb.off.x + vb.size.x / 2
        cy = vb.off.y + vb.size.y / 2
        winW = vb.size.x; winH = vb.size.y
      }
      // 🔴 2026-10-24 定标窗口留 1.35× 安全余量：若窗口恰等于身体（如石头 xiaoxiao 身体即 412 高），
      //   身体会被顶满 512 扫描画布边缘→边缘像素/抗锯齿被裁→紧盒低估（r2 再放大仍无法恢复）→角色溢出画布。
      //   留余量后身体居中且四周留白，扫描得真实整盒。
      const stt = new spine.AnimationState(new spine.AnimationStateData(skData))
      const dur = anim ? (anim.duration || 0) : 0
      const steps = Math.max(6, Math.ceil(dur * 12))
      // 🔴 2026-10-24 扫描函数改为「按给定中心定标」：两次测量各自独立定心，第二遍按第一遍量得的内容盒重定心，
      //   根治「getBounds 含巨大空附件留白（石头 xiaoxiao 盒 412 高而真实像素仅 ~243 且偏心）导致按盒定心把真身推出边缘→低估」。
      const pass = function (fitW, fitH, ccx, ccy) {
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
          c2.translate(-ccx, -ccy)
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
        const toWx = function (px) { return (px - N / 2) / s + ccx }
        const toWy = function (py) { return -(py - N / 2) / s + ccy }
        const wx1 = toWx(minX), wx2 = toWx(maxX + 1)
        const wy1 = toWy(maxY + 1), wy2 = toWy(minY)
        if (!(wx2 > wx1) || !(wy2 > wy1)) return null
        return { off: new spine.Vector2(wx1, wy1), size: new spine.Vector2(wx2 - wx1, wy2 - wy1) }
      }
      // 🔴 2026-10-24 两遍定标 + 第二遍按内容重定心：
      //   第一遍以「(vb∪liveBounds) 盒」定心留 1.5× 余量，保证身体（即便在盒内偏移）完整落画布内不被裁；
      //   第二遍以第一遍量得的内容盒为中心、留 1.15× 余量重扫→真身居中→得准确紧盒（此前第二遍仍用盒定心→偏移真身被裁→低估）。
      const r1 = pass(winW * 1.5, winH * 1.5, cx, cy)
      if (!r1) return null
      const _c2x = r1.off.x + r1.size.x / 2, _c2y = r1.off.y + r1.size.y / 2
      const r2 = pass(r1.size.x * 1.15, r1.size.y * 1.15, _c2x, _c2y)
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
    _assetCacheTrim(key) // 🔴 2026-10-24 LRU 上限：释放最久未用的模型，防内存无限增长
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
        // 🔴 2026-10-24 修复：此处原引用 `man`，但该变量在本作用域根本不存在（后面才定义的是 `_man`）
        //    → 一旦皮肤模型加载失败，回退分支会抛 ReferenceError，反而什么都不画（整块空白）。
        //    改为就地从清单取基础模型贴图页数。
        try {
          const _idx = (typeof window !== 'undefined' && window.__heroSpineIndex) ? window.__heroSpineIndex[folder] : null
          play(canvas, folder, Object.assign({}, opts, { model: '', pngs: (_idx && _idx.pngs) || 0, autoFxFallback: false }))
        } catch (e2) {}
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
      // 🔴 2026-10-24 是否存在「非 fx 的正常身体槽」（动画里挂过非 fx 附件）——
      //   供下方 autoFxFallback 判定：有身体槽的模型，剔 fx 后画面静止是正常的（人物本来就站桩），
      //   不能因此判定「该模型四肢全靠特效」而整体回退。
      let hasBodySlot = false
      if (fxHide) {
        const fxSeg = /(^|\/)fx(\/|$)/i
        // 🔴 2026-10-24 叶名以 fx 开头的特效槽（fxg01/fxfire/FX1/fx1…，见 hideFxSlots 注释）
        const fxLeaf = /(^|\/)fx/i
        skeleton.slots.forEach(function (sl, i) {
          const bn = (sl.bone && sl.bone.data && sl.bone.data.name) || ''
          const an = (sl.data && sl.data.attachmentName) || (sl.attachment && sl.attachment.name) || ''
          // 🟢 2026-10-23 槽位本身的名字也要查：皮肤模型（如骨弓 huarong）的 fx 槽 setup 为空、
          //   附件由动画挂上，启动时 an/bn 都不含 fx，只靠槽名（fx/bingyan/…）才认得出
          const sn = (sl.data && sl.data.name) || ''
          if (fxSeg.test(bn) || fxSeg.test(an) || fxSeg.test(sn) || fxLeaf.test(an) || fxLeaf.test(sn) || /特效|texiao|guangxiao/i.test(bn)) fxHide.push(i)
        })
        // 🔴 2026-10-24 规则化补强：官方部分模型 setup pose 下所有槽附件为空、槽名也不含 fx，
        //   特效只在动画 AttachmentTimeline 里挂载。典型如死神 fashi：槽 shen01/shen02 →
        //   images/fx/shen1/*、images/fx/shen4/*（setup 全空、槽名无 fx）→ 上面 bn/an/sn 三个判据
        //   全部落空 → 该槽不进 fxHide → 渲染帧（frameHide2）不压制 → 默认皮肤的大镰刀/红色纹样
        //   叠在当前皮肤上，用户看到的就是「重叠」；同时把包围盒撑大导致角色偏移变小。
        //   注意：测量路径 measureVisualBounds 是在动画 apply 之后调 hideFxSlots，能读到附件名所以没问题；
        //   只有渲染路径（基于 setup pose 的 fxHide 数组）会漏，故在此按动画 timeline 补齐。
        try {
          const _animFx = {}
          const _animBody = {}
          const _animAction = {}
          const _animNotAction = {}   // 该槽还挂过「非动作」附件（身体/fx）→ 视为混合槽，不按动作槽隐藏
          // 🔴 2026-10-24 动作类附件（攻击/技能/死亡/跑动…）：官方把这些动作帧与 idle 帧放在同一
          //   个 skeleton 里，且 idle 动画也会给这些槽挂附件 → 播放 idle 时同时画出
          //   「idle 身体 + attack/skill 身体」= 用户看到的「两个角色重叠」
          //   （死神 fashi 的 bone2→images/skill/c0002、骨弓的 images/attack/a0036 即此）。
          //   这类路径不含 fx，故 hideFx 判据抓不到，需单独按动作段识别。
          const ACTION_SEG = /\/(attack|skill|death|die|run|walk|hit|win|lose|atk|zhunbei|wait|move)(\/|$)/i
          ;(skData.animations || []).forEach(function (anim) {
            ;(anim.timelines || []).forEach(function (tl) {
              if (!tl || tl.slotIndex == null || !tl.attachmentNames) return
              const _ns = tl.attachmentNames
              for (let k = 0; k < _ns.length; k++) {
                const _nm = _ns[k]
                if (!_nm) continue
                if (fxSeg.test(_nm) || fxLeaf.test(_nm)) { _animFx[tl.slotIndex] = 1; _animNotAction[tl.slotIndex] = 1 }
                else if (ACTION_SEG.test(_nm)) _animAction[tl.slotIndex] = 1
                else { _animBody[tl.slotIndex] = 1; _animNotAction[tl.slotIndex] = 1 }
              }
            })
          })
          Object.keys(_animFx).forEach(function (si) {
            const _i = Number(si)
            if (fxHide.indexOf(_i) < 0) fxHide.push(_i)
          })
          // 动作槽仅在「确认存在非动作身体槽」时才隐藏——否则只带 attack 动画的模型会被整片清空
          if (Object.keys(_animBody).length) {
            Object.keys(_animAction).forEach(function (si) {
              // 🔴 只隐藏「纯动作槽」：若该槽还挂过身体/其它非动作附件（如 longwangpifu 的
              //    images/idle/a_0 既挂 idle 又挂 attack），隐藏会连带删掉身体 → 跳过。
              if (_animNotAction[si]) return
              const _i = Number(si)
              if (fxHide.indexOf(_i) < 0) fxHide.push(_i)
            })
          }
          // 有非 fx、非动作的正常身体槽（如死神的 images/idle/a0000）
          hasBodySlot = Object.keys(_animBody).length > 0
        } catch (e) {}
        if (!fxHide.length) fxHide = null
      }
      // 🟢 2026-10-23 渲染期槽位隐藏：如 yilidan/jietoubawang/duye 的 images/a0（半尺寸身体拷贝，
      //   游戏里是召唤分身），动画一挂就「两个身体叠一起」。调用方传槽位名数组，每帧清空。
      let slotHide = null
      if (opts.hideSlots && opts.hideSlots.length) {
        const nameIdx = {}
        skeleton.slots.forEach(function (sl, i) { nameIdx[sl.data.name] = i })
        slotHide = []
        opts.hideSlots.forEach(function (n) {
          Object.keys(nameIdx).forEach(function (nm) { if (slotMatches(n, nm)) slotHide.push(nameIdx[nm]) })
        })
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
          // 去重按「全路径家族」(f) 与「叶名家族」(lf，去掉路径与尾号) 双键：
          //   f  命中「同名同图孪生」（如 咕咕 images/a0 与 images/a0000 指向同一张图）；
          //   lf 命中「路径不同但实为同一角色的不同拷贝」（凤凰 idle/idle_00 与 idle2/idle_00、
          //       魔精灵 yuxi 与 yuxi2、火神 images/a0000 与 images/1/a0000、地精宝库 baokupifu×N）。
          //   只折叠「身体尺寸」副本（maxA≥minBody），避免误删 fxg/sp/xing 等小装饰。
          const famSlots = {}  // f  -> { slotIndex: { area, names:{} } }
          const famMax = {}
          const lfSlots = {}   // lf -> { slotIndex: { area, names:{} } }
          const lfMax = {}
          const skin0 = skData.defaultSkin || (skData.skins && skData.skins[0])
          const list = skin0 && skin0.getAttachments ? skin0.getAttachments() : []
          list.forEach(function (e) {
            const att = e.attachment
            if (!att || !att.width || !att.height) return
            const nm = e.name || ''
            if (/(^|\/)fx(\/|$)/i.test(nm)) return
            const f = nm.replace(/\d+$/, '')
            const lf = nm.replace(/^.*\//, '').replace(/\d+$/, '')
            const area = att.width * att.height
            famSlots[f] = famSlots[f] || {}
            const rec = famSlots[f][e.slotIndex] || (famSlots[f][e.slotIndex] = { area: 0, w: 0, h: 0, names: {} })
            if (area > rec.area) { rec.area = area; rec.w = att.width; rec.h = att.height }
            rec.names[nm] = 1
            if (!famMax[f] || area > famMax[f]) famMax[f] = area
            lfSlots[lf] = lfSlots[lf] || {}
            const lrec = lfSlots[lf][e.slotIndex] || (lfSlots[lf][e.slotIndex] = { area: 0, w: 0, h: 0, names: {} })
            if (area > lrec.area) { lrec.area = area; lrec.w = att.width; lrec.h = att.height }
            lrec.names[nm] = 1
            if (!lfMax[lf] || area > lfMax[lf]) lfMax[lf] = area
          })
          const hideSet = {}
          // 同族副本折叠：① 半尺寸拷贝（<60%）② 等大同名孪生（附件名集完全一致）③ 等大同族身体副本（≥minBody 且 ≥85% 主槽）
          function applyFamily(fam, famMax, minBody) {
            Object.keys(fam).forEach(function (key) {
              const entries = Object.keys(fam[key]).map(function (si) { return { si: Number(si), rec: fam[key][si] } })
              if (entries.length < 2) return
              entries.sort(function (a, b) { return (b.rec.area - a.rec.area) || (Object.keys(b.rec.names).length - Object.keys(a.rec.names).length) })
              const best = entries[0]
              const bestNames = new Set(Object.keys(best.rec.names))
              const maxA = famMax[key]
              for (let i = 1; i < entries.length; i++) {
                const o = entries[i]
                if (o.rec.area < maxA * 0.6) { hideSet[o.si] = 1; continue }            // ① 半尺寸残影
                const names = Object.keys(o.rec.names)
                if (names.length === bestNames.size && names.every(function (n) { return bestNames.has(n) })) { hideSet[o.si] = 1; continue } // ② 同名孪生
                // ③ 完全等大的同族身体副本（yuxi/yuxi2、火神 a0000×3 等）：要求宽高完全一致——
                //    真副本是同图同尺寸导出；而石头 xiaoxiao 的 G1~G8 是「多部件身体」（同族不同件、
                //    尺寸各异 221×243/192×268/…），按面积比折叠会整块删身体（10-24 实测回归，已改判据）
                if (maxA >= minBody && o.rec.w === best.rec.w && o.rec.h === best.rec.h) hideSet[o.si] = 1
              }
            })
          }
          applyFamily(famSlots, famMax, 30000)
          applyFamily(lfSlots, lfMax, 30000)
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
          // 🔴 2026-10-22 整骨架联合盒（setup + idle 全周期采样），不做任何特效剔除。
          //   逐模型的 scale/x/y 用于补偿特效撑盒与落台（见 index[folder].modelOffsets）。
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
            opts.hideSlots.forEach(function (n) {
              Object.keys(_n2).forEach(function (nm) { if (slotMatches(n, nm)) _extra.push(_n2[nm]) })
            })
            if (_extra.length) hideIdx = hideIdx ? hideIdx.concat(_extra) : _extra
          }
          if (dedupeHide && dedupeHide.length) hideIdx = hideIdx ? hideIdx.concat(dedupeHide) : dedupeHide.slice()
          // 🔴 2026-10-24 实测绘「当前可见内容」包围盒（idle 全周期 union + 与渲染一致的隐藏）：
          //   作为 measureVisualBounds 的定标窗口与定标中心。骨架盒 vb 含大量「空槽 extent」会把中心
          //   推离身体（死神 fashi 实测 vb=227×344 而身体仅 184×299），若以 vb 中心定标，身体在 512 扫描
          //   画布内偏移→被裁→紧盒低估（→角色偏大/头顶贴边）。用真实身体盒定标可根治。
          let liveBounds = null
          try {
            const _hi = frameHide2 || []
            const _save = _hi.map(function (i) { return skeleton.slots[i].attachment })
            for (let _k = 0; _k < _hi.length; _k++) skeleton.slots[_hi[_k]].attachment = null
            skeleton.updateWorldTransform()
            const _dur = animObj ? (animObj.duration || 0) : 0
            const _n = Math.max(8, Math.ceil(_dur * 20))
            let _minX = 1e9, _minY = 1e9, _maxX = -1e9, _maxY = -1e9
            for (let _i = 0; _i <= _n; _i++) {
              skeleton.setToSetupPose()
              if (animObj) { state.clearTracks(); state.setAnimation(0, animObj.name, false); state.update((_dur * _i) / _n); state.apply(skeleton) }
              skeleton.updateWorldTransform()
              const _o = new spine.Vector2(), _z = new spine.Vector2()
              skeleton.getBounds(_o, _z)
              _minX = Math.min(_minX, _o.x); _minY = Math.min(_minY, _o.y)
              _maxX = Math.max(_maxX, _o.x + _z.x); _maxY = Math.max(_maxY, _o.y + _z.y)
            }
            for (let _k = 0; _k < _hi.length; _k++) skeleton.slots[_hi[_k]].attachment = _save[_k]
            state.setAnimation(0, idle, true); state.update(0); state.apply(skeleton); skeleton.updateWorldTransform()
            if (_maxX > _minX && _maxY > _minY) liveBounds = { offX: _minX, offY: _minY, w: _maxX - _minX, h: _maxY - _minY }
          } catch (e) {}
          vbVis = measureVisualBounds(spine, skData, animObj, vb, !!fxHide, hideIdx, liveBounds) || vb
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
        // 🔴 2026-10-22 联合盒中心 + 世界单位 x/y 偏移后对准画布中心
        //   （cx = 包围盒.offset.x + sw/2 + ox; cy = ... + oy）。
        //   注：offsetX/offsetY 语义已从「画布比例」改为「世界单位」。
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
      // 🔴 2026-10-24 修正误判：原判据只看「画面静止」，但大多数角色的 idle 本来就是站桩不动
      //   （死神 fashi 剔掉 shen01/shen02 后画面当然静止）→ 被误判成「四肢全靠特效」，
      //   于是整体 hideFx:false 重播，把刚剔掉的黑红镰刀/死神残影又全放回来
      //   （用户反馈「两个死神，一个静态不动、一个很大在那播放」即此）。
      //   现加 !hasBodySlot：只有模型连一个非 fx 身体槽都没有（真·全身在 fx 路径下，
      //   如萌萌 bingdundun2）才允许整体回退；有正常身体的模型保持剔除结果。
      if (opts.autoFxFallback && frameHide2 && frameHide2.length && !hasBodySlot) {
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
    // 🔴 2026-10-24 网页版默认拒绝批量预热（仅桌面端本地资源自动跑）：
    //    网页版资源走 github.io 远程（87MB / 1132 文件），批量预热会长期占满带宽与连接池，
    //    把「静态皮肤图片」请求挤到排队/超时 → 英雄皮肤不显示、切项目卡顿（桌面端同包本地读取，不受影响）。
    //    opts.force = true 表示用户在设置面板里手动点了「立即下载全部」，尊重用户显式操作，照常执行。
    if (!opts.force) {
      try {
        const _isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__ || (navigator.userAgent || '').indexOf('Tauri') >= 0)
        if (!_isTauri) { console.log('[SPINE] 网页版跳过批量预热（避免挤占静态皮肤加载）'); return }
      } catch (e) {}
    }
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
