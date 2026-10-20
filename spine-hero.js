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
  const vbCache = {}    // folder@model -> { off, size }（按真实不透明像素测得的紧包围盒）
  let playTokenSeq = 0  // 同一 canvas 连续 play 时，仅最后一次生效（按画布各自计时）

  function baseUrl() {
    // 资源 base 可被整体切换到远端（如 Gitee 托管的完整资源集）
    if (window.__HERO_SPINE_BASE) return window.__HERO_SPINE_BASE
    const p = location.pathname
    return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1)
  }
  function ensureSpine() {
    if (window.spine) return Promise.resolve()
    if (spinePromise) return spinePromise
    const base = baseUrl()
    spinePromise = new Promise(function (resolve, reject) {
      const s1 = document.createElement('script')
      s1.src = base + 'vendor/spine-core.js'
      s1.onload = function () {
        const s2 = document.createElement('script')
        s2.src = base + 'vendor/spine-canvas.js'
        s2.onload = function () { resolve() }
        s2.onerror = reject
        document.body.appendChild(s2)
      }
      s1.onerror = reject
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
  // 采样 idle 动画求 tight 包围盒（世界坐标）
  function computeBounds(spine, skData, animName) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const off = new spine.Vector2(), sz = new spine.Vector2()
    const tmp = new spine.Skeleton(skData)
    const stt = new spine.AnimationState(new spine.AnimationStateData(skData))
    const merge = function (o, s) {
      if (!isFinite(o.x) || !isFinite(o.y) || !isFinite(s.x) || !isFinite(s.y) || s.x <= 0 || s.y <= 0) return
      minX = Math.min(minX, o.x); minY = Math.min(minY, o.y)
      maxX = Math.max(maxX, o.x + s.x); maxY = Math.max(maxY, o.y + s.y)
    }
    tmp.setToSetupPose(); tmp.updateWorldTransform(); tmp.getBounds(off, sz); merge(off, sz)
    const anim = animName ? skData.findAnimation(animName) : null
    if (anim) {
      const dur = anim.duration || 1
      const n = Math.max(24, Math.ceil(dur * 30))
      for (let i = 0; i <= n; i++) {
        tmp.setToSetupPose(); stt.clearTracks(); stt.setAnimation(0, anim.name, false)
        stt.update((dur * i) / n); stt.apply(tmp); tmp.updateWorldTransform(); tmp.getBounds(off, sz); merge(off, sz)
      }
    }
    return { off: new spine.Vector2(minX, minY), size: new spine.Vector2(maxX - minX, maxY - minY) }
  }

  // 按真实不透明像素测量紧凑包围盒（骨架 getBounds 会含大量空白附属/离屏附件，
  // 直接用会导致角色偏小且偏离中心）。把整块网格渲染到小画布，扫 alpha 求紧边界再换算回世界坐标。
  function measureVisualBounds(spine, skeleton, vb) {
    try {
      const sw = vb.size.x, sh = vb.size.y
      if (!(sw > 0 && sh > 0)) return null
      const N = 320
      const s = Math.min((N - 6) / sw, (N - 6) / sh)
      const oc = document.createElement('canvas')
      oc.width = N; oc.height = N
      const c2 = oc.getContext('2d', { willReadFrequently: true })
      const cx = vb.off.x + sw / 2, cy = vb.off.y + sh / 2
      c2.save()
      c2.translate(N / 2, N / 2)
      c2.scale(s, -s)
      c2.translate(-cx, -cy)
      const r2 = new spine.canvas.SkeletonRenderer(c2)
      r2.triangleRendering = true
      r2.draw(skeleton)
      c2.restore()
      const data = c2.getImageData(0, 0, N, N).data
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
      for (let y = 0; y < N; y++) {
        const row = y * N
        for (let x = 0; x < N; x++) {
          if (data[(row + x) * 4 + 3] > 24) {
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
      const wy1 = toWy(maxY + 1), wy2 = toWy(minY) // canvas y 向下，世界 y 向上
      if (!(wx2 > wx1) || !(wy2 > wy1)) return null
      return { off: new spine.Vector2(wx1, wy1), size: new spine.Vector2(wx2 - wx1, wy2 - wy1) }
    } catch (e) { return null }
  }

  // 加载并解析 folder 的骨架资源（带缓存；失败返回 null，由调用方展示状态）
  // model：皮肤独立骨骼名（官方每个皮肤在英雄目录下有独立资源），有则读 models/<model>/ 子目录
  // pngCount：清单登记的贴图页数（p0..pN-1）；不传则逐个试到失败为止
  async function loadAssets(folder, pngCount, model) {
    const key = folder + '@' + (model || '')
    if (assetCache[key]) return assetCache[key]
    const base = baseUrl() + 'data/hero-spine/' + folder + (model ? '/models/' + model : '') + '/'
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
      statusCb('读取骨骼资源失败: ' + folder)
      return
    }
    if (token !== st.token) return // 已被后续 play 抢占，避免双 raf
    try {
      const skData = assets.skData
      const skeleton = new spine.Skeleton(skData)
      skeleton.setToSetupPose()
      const state = new spine.AnimationState(new spine.AnimationStateData(skData))
      const renderer = new spine.canvas.SkeletonRenderer(canvas.getContext('2d'))
      renderer.triangleRendering = true
      const anims = skData.animations.map(function (a) { return a.name })
      const idle = anims.find(function (a) { return /idle/i.test(a) }) || anims[0]
      const vb = computeBounds(spine, skData, idle)
      state.setAnimation(0, idle, true)
      state.update(0); state.apply(skeleton); skeleton.updateWorldTransform()

      // 真实不透明像素的紧包围盒（缓存）：修正骨架 getBounds 空白过多导致的偏小/偏心
      // 仅 opts.tight 时启用（详情大图用），避免改变战场小卡/图鉴既有观感
      const vbKey = folder + '@' + (opts.model || '')
      let vbVis = vb
      if (opts.tight) {
        vbVis = vbCache[vbKey]
        if (!vbVis) {
          vbVis = measureVisualBounds(spine, skeleton, vb) || vb
          if (vbVis !== vb) vbCache[vbKey] = vbVis
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
        // 🔴 2026-10-21 横向以「骨架包围盒中心」为准（模型作者坐标系）：
        //    紧包围盒含武器/披风/特效等单侧内容，按它居中会把人物本体挤偏（死神等）；
        //    纵向/高度仍用紧包围盒（保证各英雄大小一致）。offsetX 为逐英雄微调（画布宽比例）。
        const cx = (opts.tight && opts.centerByVisualX !== true)
            ? (vb.off.x + vb.size.x / 2)
            : (vbVis.off.x + sw / 2)
        ctx.save()
        if (opts.offsetX) ctx.translate(w * Number(opts.offsetX), 0)
        if (opts.anchorFeet != null) {
          // 底边中点对齐锚点：横向居中、纵向落在石台面（角色详情用）
          ctx.translate(w / 2, h * opts.anchorFeet)
          ctx.scale(fitScale, -fitScale)
          ctx.translate(-cx, -vbVis.off.y)
        } else {
          const cy = vbVis.off.y + sh / 2
          ctx.translate(w / 2, h / 2)
          ctx.scale(fitScale, -fitScale)
          ctx.translate(-cx, -cy)
        }
        renderer.draw(skeleton)
        ctx.restore()
      }
      st.raf = requestAnimationFrame(tick)
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

  window.spineHero = { play: play, stop: stop }
})()
