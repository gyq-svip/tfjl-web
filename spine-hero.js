// ============================================================
// 英雄 Spine 动画播放器（PoC）
//   官方 Spine 3.8 Canvas 运行时（vendor/spine-core.js + spine-canvas.js）
//   资源：data/hero-spine/<folder>/ skeleton.json + atlas.txt + p*.png
//   移植自 TDS toolbox SpineViewer.vue 的核心（加载 + 包围盒居中 + idle 循环）
// 用法：spineHero.play(canvas, 'qiqi', { fitPadding: 0.9 })
// ============================================================
;(function () {
  let spinePromise = null
  function baseUrl() {
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

  async function play(canvas, folder, opts) {
    opts = opts || {}
    const st = (canvas._spineSt = canvas._spineSt || {})
    st.playing = false
    const statusCb = opts.onStatus || function () {}
    try {
      statusCb('加载 Spine 运行时…')
      await ensureSpine()
    } catch (e) {
      statusCb('Spine 运行时加载失败')
      return
    }
    const spine = window.spine
    if (!spine) { statusCb('Spine 运行时缺失'); return }
    const base = baseUrl() + 'data/hero-spine/' + folder + '/'
    let skeletonJson, atlasText
    try {
      skeletonJson = await (await fetch(base + 'skeleton.json')).json()
      atlasText = await (await fetch(base + 'atlas.txt')).text()
    } catch (e) {
      statusCb('读取骨骼资源失败: ' + folder)
      return
    }
    // 贴图按页序加载（p0..p8，逐个试直到失败）
    const imgs = []
    for (let i = 0; i < 9; i++) {
      try { imgs.push(await loadImage(base + 'p' + i + '.png')) } catch (e) { break }
    }
    if (!imgs.length) { statusCb('无贴图'); return }
    try {
      let pi = 0
      const atlas = new spine.TextureAtlas(atlasText, function () {
        const img = imgs[pi++] || imgs[0]
        return new spine.canvas.CanvasTexture(img)
      })
      const skData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonJson)
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
      canvas._spineSt.playing = false
      if (canvas._spineSt.raf) cancelAnimationFrame(canvas._spineSt.raf)
    }
  }

  window.spineHero = { play: play, stop: stop }
})()
