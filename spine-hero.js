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

  // 加载并解析 folder 的骨架资源（带缓存；失败返回 null，由调用方展示状态）
  // pngCount：清单登记的贴图页数（p0..pN-1）；不传则逐个试到失败为止
  async function loadAssets(folder, pngCount) {
    if (assetCache[folder]) return assetCache[folder]
    const base = baseUrl() + 'data/hero-spine/' + folder + '/'
    let skeletonJson, atlasText
    skeletonJson = await (await fetch(base + 'skeleton.json')).json()
    atlasText = await (await fetch(base + 'atlas.txt')).text()
    // 贴图按页序加载（p0..p8，逐个试直到失败）
    const imgs = []
    const maxPages = pngCount > 0 ? pngCount : 9
    for (let i = 0; i < maxPages; i++) {
      try { imgs.push(await loadImage(base + 'p' + i + '.png')) } catch (e) { break }
    }
    if (!imgs.length) throw new Error('无贴图')
    let pi = 0
    const atlas = new spine.TextureAtlas(atlasText, function () {
      const img = imgs[pi++] || imgs[0]
      return new spine.canvas.CanvasTexture(img)
    })
    const skData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonJson)
    const entry = { skData: skData, atlas: atlas }
    assetCache[folder] = entry
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
      assets = await loadAssets(folder, opts.pngs)
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
        const sw = vb.size.x, sh = vb.size.y
        if (!(sw > 0 && sh > 0)) return
        const fitScale = Math.min(w / sw, h / sh) * (opts.fitPadding != null ? opts.fitPadding : 0.9)
        const cx = vb.off.x + sw / 2, cy = vb.off.y + sh / 2
        ctx.save()
        ctx.translate(w / 2, h / 2)
        ctx.scale(fitScale, -fitScale)
        ctx.translate(-cx, -cy)
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
