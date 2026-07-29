/* ============================================================
 * 阵容识别模块（独立入口 + 灌入脚本生成）
 * - 粘贴/选择战斗截图 → ⚡自动识别 10 张英雄卡（全图 OCR，无需对齐）
 * - 100 英雄库校验（✓对 / ⚠4字留意 / ✗不在100库）
 * - OCR 仅用本机 Umi-OCR：Tauri 桥接(umi_ocr) → /umi-ocr 本地代理（开发环境）；不依赖任何云端 OCR，未安装 Umi-OCR 则不支持识别
 * - “填入脚本生成”把通过校验的英雄按 上阵：英雄1,英雄2,… 写入 #parserInput
 * 说明：皮肤不参与识别，只认 100 个精确英雄卡名。
 * ============================================================ */
(function () {
  'use strict';

  // ====================== 100 英雄库（最权威，错不了） ======================
  const DEFAULT_HEROES = [
    "天使","鱼人","风灵","圣骑","射线","宝库","潜艇","死神","酋长","电法","火灵","战将","咕咕","火炮","水灵",
    "萌萌","小野","刀客","霸王","亡将","铁骑","石头","小丑","女王","沙皇","飞机","炎魔","蛇女","虎弓","后羿",
    "海妖","骨弓","鲛女","巫医","影","魇","葵","傀","邪","大圣","闪","土灵","咬人娃娃","龙王","钟馗","悟空",
    "冰骑","恶魔","幽灵","神龙","骨龙","祭司","小炮","爱神","船长","毒王","炸弹","火枪","松鼠","绿弓","蜘蛛",
    "冰弓","小鹿","大树","猫咪","萨满","地精","工匠","火法","暗法","冰法","凤凰","火神","阿翼","龟相","谜云",
    "雷神","女妖","神龛","刺客","钢鬃","恶匪","斧客","剑客","龙拳","狂将","孤星","领主","狂龙","土精灵","彩精灵",
    "魔精灵","木精灵","光精灵","幻精灵","雷精灵","冰精灵","暗精灵","魂精灵","冰鸟"
  ];
  // 显示名别名（游戏显示名 → 库名）
  const ALIASES = { "邪能火炮":"火炮", "地精宝库":"宝库", "微型潜艇":"潜艇" };

  // ====================== 工具 ======================
  const $ = id => document.getElementById(id);
  function norm(t){ return (t||'').replace(/[\s　]/g,'').replace(/[，。、·:：]/g,''); }
  function isTauri(){
    return !!(window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function')
        || !!(window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function');
  }
  async function tauriInvoke(cmd, args){
    if(window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function')
      return await window.__TAURI_INTERNALS__.invoke(cmd, args);
    if(window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function')
      return await window.__TAURI__.core.invoke(cmd, args);
    throw new Error('Tauri 不可用');
  }

  // ====================== Umi-OCR 离线引擎探测 + 无感启动 ======================
  // 官方下载（建议装 Paddle 版，精度最高）：https://github.com/hiroi-sora/Umi-OCR/releases
  const UMI_OCR_DOWNLOAD = 'https://github.com/hiroi-sora/Umi-OCR/releases';
  // 记住 exe 路径：APP 存 D 盘 json，浏览器存 localStorage
  const UMI_PATH_FILE = 'D:\\withfriends\\塔防精灵助手数据\\data\\umi-ocr-path.json';
  // 1x1 透明 PNG，仅用于探测服务是否可达（不真正识别）
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  const sleep = ms => new Promise(r=>setTimeout(r, ms));
  function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function setTip(tip, bg, color, html){
    tip.style.background = bg; tip.style.color = color; tip.innerHTML = html;
  }

  // 读取已记住的 Umi-OCR.exe 路径
  async function getStoredUmiPath(){
    if(isTauri()){
      try{ const s = await tauriInvoke('read_text_file_auto', { file_path: UMI_PATH_FILE });
           const j = JSON.parse(s); return (j && j.path) || ''; }catch(e){ return ''; }
    }
    try{ return localStorage.getItem('tfjl_umi_ocr_path') || ''; }catch(e){ return ''; }
  }
  async function setStoredUmiPath(p){
    if(isTauri()){
      try{ await tauriInvoke('write_text_file', { file_path: UMI_PATH_FILE, content: JSON.stringify({path:p}) }); }catch(e){}
    }
    try{ localStorage.setItem('tfjl_umi_ocr_path', p); }catch(e){}
  }

  // 返回 true=已连接 / false=未安装或未启动 / null=非 APP 环境（不提示）
  async function checkUmiOcrAvailable(){
    if(!isTauri()) return null;
    try{
      await tauriInvoke('umi_ocr', {
        base64: TINY_PNG.split(',')[1],
        options: { data:{format:'dict'}, ocr:{language:'models/config_chinese.txt', cls:true} }
      });
      return true; // 能连通（哪怕识别结果为空，也算服务在跑）
    }catch(e){
      const msg = ((e && (e.message || e)) + '') || '';
      // reqwest 连接被拒 / 超时 = Umi-OCR 未启动
      if(/请求 Umi-OCR 失败|error sending request|connection|refused|timed out|无法连接/i.test(msg)) return false;
      return true; // 其他错误（如图片太小）视为服务在跑
    }
  }

  // 用已记住的路径自动拉起 Umi-OCR，并轮询等待服务就绪
  async function autoStartUmiOcr(){
    const p = await getStoredUmiPath();
    if(!p) return false;
    try{ await tauriInvoke('start_umi_ocr', { exe_path: p }); }
    catch(e){ return false; }
    for(let i=0;i<12;i++){
      await sleep(800);
      if(await checkUmiOcrAvailable() === true) return true;
    }
    return false;
  }

  // 用户点“选择 Umi-OCR.exe”：弹系统文件框 → 记住路径 → 自动拉起
  function bindPickUmi(tip){
    const a = $('recPickUmi');
    if(!a) return;
    a.onclick = async (e)=>{
      e.preventDefault();
      tip.innerHTML = '请选择本机 Umi-OCR.exe …';
      try{
        const p = await tauriInvoke('pick_umi_ocr_exe');
        if(!p){ tip.innerHTML = '已取消选择。'; return; }
        await setStoredUmiPath(p);
        tip.innerHTML = '已选择，正在自动启动 Umi-OCR …';
        const ok = await autoStartUmiOcr();
        if(ok) setTip(tip, 'rgba(76,175,80,0.15)', '#81c784', '✅ 已自动启动本机 Umi-OCR（离线精准识别）');
        else setTip(tip, 'rgba(255,167,38,0.18)', '#ffb74d',
          '⚠️ 已选择该 exe 但仍无法启动。请确认路径正确，或手动双击打开 Umi-OCR 后重试。');
      }catch(err){ tip.innerHTML = '选择失败: ' + (err && err.message || err); }
    };
  }

  async function showUmiTip(){
    const tip = $('recUmiTip');
    if(!tip) return;
    if(!isTauri()){ tip.style.display = 'none'; return; } // 浏览器环境不提示安装
    tip.style.display = 'block';
    setTip(tip, 'rgba(255,167,38,0.15)', '#ffb74d', '检测本机 Umi-OCR 中…');

    const av = await checkUmiOcrAvailable();
    if(av === true){
      setTip(tip, 'rgba(76,175,80,0.15)', '#81c784', '✅ 已连接本机 Umi-OCR（离线精准识别）');
      return;
    }
    // 未连接：若已记住路径则无感自动拉起
    const stored = await getStoredUmiPath();
    if(stored){
      tip.innerHTML = '未检测到 Umi-OCR，正在自动启动…';
      const ok = await autoStartUmiOcr();
      if(ok){
        setTip(tip, 'rgba(76,175,80,0.15)', '#81c784', '✅ 已自动启动本机 Umi-OCR（离线精准识别）');
        return;
      }
      setTip(tip, 'rgba(255,167,38,0.18)', '#ffb74d',
        '⚠️ 已尝试自动启动 Umi-OCR 但失败（记录路径：' + escapeHtml(stored) + '）。'
        + '<a href="#" id="recPickUmi" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">重新选择 Umi-OCR.exe</a>'
        + '，或<a href="'+UMI_OCR_DOWNLOAD+'" target="_blank" rel="noopener" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">下载安装</a>。');
      bindPickUmi(tip);
      return;
    }
    // 从未选过：提示选择（选完即自动后台拉起，无需手动打开）
    setTip(tip, 'rgba(255,167,38,0.18)', '#ffb74d',
      '⚠️ 阵容识别依赖本机 Umi-OCR（<b>完全免费开源</b>），需先选择本机 Umi-OCR.exe。'
      + '<a href="#" id="recPickUmi" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">选择 Umi-OCR.exe</a>'
      + '（<a href="'+UMI_OCR_DOWNLOAD+'" target="_blank" rel="noopener" style="color:#4fc3f7;text-decoration:underline;">下载</a>，建议 Paddle 版）。选好后助手会<b>自动后台启动</b>，无需手动打开。');
    bindPickUmi(tip);
  }

  // ====================== OCR 原文 → 库名 ======================
  function matchHero(raw){
    let t = norm(raw);
    if(!t) return {hero:null, score:0, method:'空'};
    if(DEFAULT_HEROES.includes(t)) return {hero:t, score:1.0, method:'精确'};
    if(ALIASES[t]) return {hero:ALIASES[t], score:0.96, method:'别名'};
    for(const h of DEFAULT_HEROES){ if(t.includes(h)) return {hero:h, score:0.82, method:'包含(显⊃库)'}; }
    for(const h of DEFAULT_HEROES){ if(h.includes(t) && t.length>=1) return {hero:h, score:0.7, method:'包含(库⊃显)'}; }
    if(t.includes('·')){
      const after = t.split('·').pop();
      if(DEFAULT_HEROES.includes(after)) return {hero:after, score:0.85, method:'去前缀'};
    }
    return {hero:null, score:0, method:'无'};
  }
  function isFourCharName(n){ return [...norm(n)].length === 4; }
  function validateHero100(name){
    const n = norm(name);
    if(!n) return {ok:false, reason:'空/未识别', four:false, hero:null};
    if(DEFAULT_HEROES.includes(n)) return {ok:true, hero:n, four:isFourCharName(n)};
    if(ALIASES[n] && DEFAULT_HEROES.includes(ALIASES[n])) return {ok:true, hero:ALIASES[n], four:isFourCharName(n)};
    return {ok:false, reason:'不在100英雄库', four:isFourCharName(n), hero:null};
  }

  // ====================== OCR 取文字块（带坐标） ======================
  function boxFromUmi(ub){
    const xs=ub.map(p=>p[0]), ys=ub.map(p=>p[1]);
    const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
    return {x0,y0,x1,y1,cx:(x0+x1)/2,cy:(y0+y1)/2,w:x1-x0,h:y1-y0};
  }

  // 仅使用本机 Umi-OCR：APP 内走 Tauri 桥接，开发环境走本地代理。
  // 不依赖任何云端 OCR；未安装 Umi-OCR 则直接报错，由弹窗提示用户安装。
  async function ocrItems(dataUrl){
    const b64 = dataUrl.split(',')[1];
    if(isTauri()){
      const j = await tauriInvoke('umi_ocr', {
        base64: b64,
        options: { data:{format:'dict'}, ocr:{language:'models/config_chinese.txt', cls:true} }
      });
      if(j && j.code===100) return {items: j.data||[], source:'Umi-OCR(桥接)'};
      if(j && j.code===101) return {items:[], source:'Umi-OCR(空)'};
      throw new Error(typeof j==='string'?j:(j&&j.data)||'Umi-OCR 返回异常');
    }
    // 开发环境：本地代理（tools/server.js）
    const resp = await fetch('/umi-ocr', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({base64:b64, options:{data:{format:'dict'}, ocr:{language:'models/config_chinese.txt', cls:true}}})});
    if(resp.ok){ const j = await resp.json(); if(j.code===100) return {items:j.data||[], source:'Umi-OCR(代理)'}; }
    throw new Error('本功能需要本机 Umi-OCR（免费开源），未安装则不支持识别。请在桌面端安装并双击打开 Umi-OCR 后重试。');
  }

  // ====================== 自动识别主流程 ======================
  function autoRecognize(img, canvas, statusEl, onDone){
    if(!img){ alert('请先粘贴或选择一张截图'); return; }
    statusEl.textContent = '全图 OCR 识别中…';
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext('2d').drawImage(img,0,0);
    const dataUrl = cv.toDataURL('image/png');
    ocrItems(dataUrl).then(({items, source})=>{
      const LOOSE = ['包含(库⊃显)','模糊','模糊(低)'];
      const anchors = [];
      for(const it of items){
        const m = matchHero(it.text);
        if(!m.hero || LOOSE.includes(m.method)) continue;
        const v = validateHero100(m.hero);
        if(!v.ok) continue;
        anchors.push({text:it.text, hero:v.hero, score:m.score, method:m.method, box:boxFromUmi(it.box), valid:v});
      }
      // 按 y 聚类成行
      anchors.sort((a,b)=>a.box.cy-b.box.cy);
      const rows=[];
      for(const a of anchors){
        const last = rows.length?rows[rows.length-1]:null;
        if(!last || Math.abs(a.box.cy-last[0].box.cy) > Math.max(a.box.h,last[0].box.h)*1.2) rows.push([a]);
        else last.push(a);
      }
      rows.forEach(r=>r.sort((a,b)=>a.box.cx-b.box.cx));
      const results=[]; let idx=0;
      for(const r of rows) for(const a of r){
        idx++;
        results.push({idx, text:a.text, hero:a.hero, score:a.score, method:a.method, valid:a.valid, box:a.box});
      }
      drawBoxes(canvas, img, results);
      onDone(results, source, rows.length);
    }).catch(e=>{ statusEl.textContent='识别失败'; alert('识别失败: '+e.message); });
  }

  function drawBoxes(canvas, img, results){
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img,0,0);
    ctx.lineWidth = Math.max(2, canvas.width/600);
    results.forEach(r=>{
      ctx.strokeStyle = r.valid && r.valid.four ? 'rgba(249,168,37,0.95)' : 'rgba(76,201,240,0.95)';
      ctx.strokeRect(r.box.x0, r.box.y0, r.box.x1-r.box.x0, r.box.y1-r.box.y0);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `bold ${Math.max(13,canvas.width/100)}px sans-serif`;
      ctx.fillText(String(r.idx), r.box.x0+2, r.box.y0-3);
    });
  }

  function validCellHtml(v){
    if(!v) return '<span style="color:#888">—</span>';
    if(v.ok) return v.four
      ? '<span style="color:#f9a825;font-weight:600;">⚠ 4字·对</span>'
      : '<span style="color:#2e7d32;font-weight:600;">✓ 对</span>';
    return '<span style="color:#c62828;font-weight:600;">✗ '+v.reason+'</span>';
  }

  // ====================== UI：浮窗按钮 + 弹窗 ======================
  function buildUI(){
    const btn = document.createElement('div');
    btn.textContent = '📷 阵容识别';
    btn.title = '粘贴/选择战斗截图，自动识别 10 张英雄卡';
    Object.assign(btn.style, {
      position:'fixed', bottom:'52px', right:'10px', zIndex:'9999',
      background:'linear-gradient(135deg,#4caf50,#2e7d32)', color:'#fff',
      padding:'8px 12px', borderRadius:'20px', cursor:'pointer', fontSize:'0.8rem',
      boxShadow:'0 4px 12px rgba(0,0,0,0.4)', userSelect:'none'
    });
    btn.onclick = openModal;
    document.body.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.id = 'recognizeOverlay';
    overlay.style.display = 'none';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,0.7)', zIndex:'10000',
      display:'none', alignItems:'center', justifyContent:'center', padding:'16px'
    });
    overlay.innerHTML = `
      <div style="background:#1b1f2a;color:#eee;border-radius:12px;max-width:960px;width:100%;max-height:92vh;overflow:auto;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,0.6);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <b style="font-size:1.05rem;">📷 阵容识别（自动识别 10 张英雄卡）</b>
          <span id="recSrc" style="font-size:0.75rem;color:#90caf9;"></span>
          <span style="flex:1;"></span>
          <span id="recStatus" class="hint" style="font-size:0.8rem;color:#aaa;"></span>
          <span style="cursor:pointer;font-size:1.3rem;padding:0 6px;" id="recClose">✕</span>
        </div>
        <div id="recUmiTip" style="display:none;font-size:0.78rem;margin-bottom:10px;padding:7px 10px;border-radius:8px;line-height:1.5;"></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:280px;">
            <div style="margin-bottom:8px;">
              <input type="file" id="recFile" accept="image/*" style="color:#ccc;font-size:0.8rem;">
              <span style="font-size:0.75rem;color:#90a4ae;"> 也可直接 Ctrl+V 粘贴截图</span>
            </div>
            <canvas id="recCanvas" style="width:100%;max-height:46vh;background:#000;border-radius:8px;display:block;"></canvas>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
              <button id="recAuto" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600;">⚡ 自动识别(无需对齐)</button>
              <button id="recFill" style="background:linear-gradient(135deg,#42a5f5,#1565c0);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;">➡ 填入脚本生成</button>
            </div>
            <div style="font-size:0.72rem;color:#789;margin-top:6px;">识别只认 100 个精确英雄卡名（皮肤不参与）；不在 100 库内即判“疑似识别错”。</div>
          </div>
          <div style="flex:1;min-width:280px;overflow:auto;max-height:60vh;">
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
              <thead><tr style="text-align:left;color:#90caf9;">
                <th style="padding:4px;">#</th><th>OCR原文</th><th>英雄</th><th>校验(100库)</th>
              </tr></thead>
              <tbody id="recBody"></tbody>
            </table>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.onclick = (e)=>{ if(e.target===overlay) overlay.style.display='none'; };
    $('recClose').onclick = ()=> overlay.style.display='none';

    let currentImg = null;
    const loadImg = (file)=>{
      const fr = new FileReader();
      fr.onload = ()=>{
        const im = new Image();
        im.onload = ()=>{ currentImg = im; const c=$('recCanvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext('2d').drawImage(im,0,0); };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    };
    $('recFile').onchange = (e)=>{ if(e.target.files[0]) loadImg(e.target.files[0]); };
    document.addEventListener('paste', (e)=>{
      if(overlay.style.display==='none') return;
      const it = e.clipboardData && e.clipboardData.items && [...e.clipboardData.items].find(i=>i.type&&i.type.startsWith('image/'));
      if(it){ const f=it.getAsFile(); if(f){ e.preventDefault(); loadImg(f); } }
    });
    $('recAuto').onclick = ()=>{
      autoRecognize(currentImg, $('recCanvas'), $('recStatus'), (results, source, rowCount)=>{
        $('recSrc').textContent = '来源: '+source;
        $('recStatus').textContent = `识别完成：${results.length} 个英雄（${rowCount} 行）`;
        const tb = $('recBody'); tb.innerHTML='';
        results.forEach(r=>{
          const tr = document.createElement('tr');
          tr.style.borderTop = '1px solid #333';
          tr.innerHTML = `<td style="padding:4px;color:#90a4ae;">${r.idx}</td>
            <td style="padding:4px;">${r.text}</td>
            <td style="padding:4px;font-weight:600;color:#fff;">${r.hero}</td>
            <td style="padding:4px;">${validCellHtml(r.valid)}</td>`;
          tb.appendChild(tr);
        });
        overlay._results = results;
      });
    };
    $('recFill').onclick = ()=>{
      const results = overlay._results;
      if(!results || !results.length){ alert('请先识别'); return; }
      const heroes = results.filter(r=>r.valid && r.valid.ok).map(r=>r.hero);
      if(!heroes.length){ alert('没有通过校验的英雄可填入'); return; }
      if(typeof selectQuickCard === 'function'){
        heroes.forEach(h=> selectQuickCard(h));
        $('recStatus').textContent = `已填入 ${heroes.length} 个英雄到脚本生成`;
        setTimeout(()=>{ overlay.style.display='none'; }, 600);
      } else {
        // 兜底：直接写 #parserInput
        const ta = $('parserInput');
        if(ta){ ta.value = '上阵：' + heroes.join(','); ta.dispatchEvent(new Event('input')); }
        overlay.style.display='none';
      }
    };
  }

  function openModal(){ const o=$('recognizeOverlay'); if(o) o.style.display='flex'; showUmiTip(); }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
