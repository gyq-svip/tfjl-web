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
    try{
      if(window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function')
        return await window.__TAURI_INTERNALS__.invoke(cmd, args);
      if(window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function')
        return await window.__TAURI__.core.invoke(cmd, args);
      throw new Error('Tauri 不可用');
    }catch(e){
      // 统一成 Error，避免上层 e.message 为 undefined（Tauri 偶尔以字符串拒绝）
      throw (e instanceof Error) ? e
        : new Error(typeof e === 'string' ? e
            : ((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : '调用失败')));
    }
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
      try{ const s = await tauriInvoke('read_text_file_auto', { filePath: UMI_PATH_FILE });
           const j = JSON.parse(s); return (j && j.path) || ''; }catch(e){ return ''; }
    }
    try{ return localStorage.getItem('tfjl_umi_ocr_path') || ''; }catch(e){ return ''; }
  }
  async function setStoredUmiPath(p){
    if(isTauri()){
      try{ await tauriInvoke('write_text_file', { filePath: UMI_PATH_FILE, content: JSON.stringify({path:p}) }); }catch(e){}
    }
    try{ localStorage.setItem('tfjl_umi_ocr_path', p); }catch(e){}
  }

  // ====================== Umi-OCR 后台运行自动配置 ======================
  // 把 Umi-OCR 配置成“后台运行”：开机自启 + 隐藏系统托盘 + 启动即隐藏
  // （HTTP 服务与“启动后缩小到托盘”我们已用 --hide + 默认配置保证；这里补另外两项用户常想要的）
  function umiSettingsGuideHtml(){
    return '关于 Umi-OCR 后台运行：<br>'
      + '• <b>允许 HTTP 服务</b>：默认已开启（主机 127.0.0.1:1224），自动启动依赖它；<br>'
      + '• <b>启动后缩小到托盘</b>：我们每次自动启动都带 <code>--hide</code>，已自动处理；<br>'
      + '• <b>开机自启 / 隐藏系统托盘</b>：Umi-OCR 自己的设置，'
      + '<a href="#" data-act="cfgumi" style="color:#4fc3f7;text-decoration:underline;">点此让助手自动写入配置</a>'
      + '（写入后需重启 Umi-OCR 生效），或你自行在 Umi-OCR「全局设置」里勾选。';
  }
  // 计算 Umi-OCR 的 .settings 路径（exe 同级 UmiOCR-data/.settings）
  function umiSettingsPathOf(exe){
    const i = Math.max(exe.lastIndexOf('\\'), exe.lastIndexOf('/'));
    return exe.slice(0, i) + '\\UmiOCR-data\\.settings';
  }
  // 自动写入后台运行三项设置；返回 {ok, msg}
  async function applyUmiBackgroundSettings(){
    const p = await getStoredUmiPath();
    if(!p) return { ok:false, msg:'请先选择/自动查找到 Umi-OCR.exe' };
    const settingsPath = umiSettingsPathOf(p);
    let text = '';
    try{ text = await tauriInvoke('read_text_file_auto', { filePath: settingsPath }); }
    catch(e){ return { ok:false, msg:'读取 Umi-OCR 配置失败（'+((e&&e.message)||e)+'），请直接在 Umi-OCR 全局设置里勾选' }; }
    const keys = { 'shortcut.startup':'true', 'window.hideTrayIcon':'true', 'window.startupInvisible':'true' };
    const lines = text.split(/\r?\n/);
    const changed = {}; for(const k in keys) changed[k] = false;
    let inGlobal = false;
    for(let i=0;i<lines.length;i++){
      const line = lines[i];
      if(/^\s*\[/.test(line)){ inGlobal = /^\[Global\]/i.test(line.trim()); continue; }
      if(!inGlobal) continue;
      for(const k in keys){
        if(new RegExp('^\\s*'+k.replace(/\./g,'\\.')+'\\s*=').test(line)){
          lines[i] = k + '=' + keys[k]; changed[k] = true;
        }
      }
    }
    const inserted = [];
    for(const k in keys){ if(!changed[k]) inserted.push(k+'='+keys[k]); }
    if(inserted.length){
      for(let i=0;i<lines.length;i++){
        if(/^\[Global\]/i.test(lines[i].trim())){ lines.splice(i+1, 0, ...inserted); break; }
      }
    }
    const out = lines.join('\r\n');
    try{ await tauriInvoke('write_text_file', { filePath: settingsPath, content: out }); }
    catch(e){ return { ok:false, msg:'写入 Umi-OCR 配置失败（'+((e&&e.message)||e)+'）' }; }
    return { ok:true, msg:'已写入配置（开机自启 + 隐藏托盘 + 启动即隐藏）。需重启 Umi-OCR 生效：关掉它再点「🚀 启动识别引擎」即可。' };
  }
  async function cfgUmiHandler(tip){
    tip = tip || $('recUmiTip');
    tip.innerHTML = '正在写入 Umi-OCR 后台运行配置…';
    const r = await applyUmiBackgroundSettings();
    if(r.ok) setTip(tip,'rgba(76,175,80,0.15)','#81c784','✅ '+r.msg);
    else setTip(tip,'rgba(255,167,38,0.18)','#ffb74d','⚠️ '+r.msg);
  }

  // 返回 true=已连接 / false=未安装或未启动 / null=非 APP 环境（不提示）
  async function checkUmiOcrAvailable(){
    if(!isTauri()) return null;
    try{
      await tauriInvoke('umi_ocr', {
        base64: TINY_PNG.split(',')[1],
        options: { data:{format:'dict', outputDirName:'', outputFileName:'', outputFileFormat:[]}, ocr:{language:'models/config_chinese.txt', cls:true} }
      });
      return true; // 能连通（哪怕识别结果为空，也算服务在跑）
    }catch(e){
      const msg = ((e && (e.message || e)) + '') || '';
      // reqwest 连接被拒 / 超时 = Umi-OCR 未启动
      if(/请求 Umi-OCR 失败|error sending request|connection|refused|timed out|无法连接/i.test(msg)) return false;
      return true; // 其他错误（如图片太小）视为服务在跑
    }
  }

  // 探测一次：Umi-OCR 返回任意 JSON（未抛网络错误）= 服务/引擎已就绪
  async function probeUmiReady(){
    try{
      await tauriInvoke('umi_ocr', {
        base64: TINY_PNG.split(',')[1],
        options: { data:{format:'dict', outputDirName:'', outputFileName:'', outputFileFormat:[]}, ocr:{language:'models/config_chinese.txt', cls:true} }
      });
      return true;
    }catch(e){ return false; }
  }

  // 用已记住的路径自动拉起 Umi-OCR：先无感隐藏启动并轮询引擎就绪；
  // 若隐藏启动始终起不来（部分机器隐藏态引擎不加载），回退为可见窗口启动（用户实测可见窗口可用）
  // 仅确保 Umi-OCR“托盘图标隐藏 + 启动即隐藏”（用户常问“OCR 图标为什么没隐藏”）：
  // --hide 只是启动后缩小到托盘（托盘图标仍在），必须 window.hideTrayIcon=true 才真正不显示图标。
  // 每次自动启动 OCR 前 best-effort 写入（失败不影响启动）。配置是纯 ASCII（@Variant 是文本转义），read_text_file_auto 不会损坏。
  async function ensureUmiTrayHidden(){
    try{
      const p = await getStoredUmiPath();
      if(!p) return;
      const settingsPath = umiSettingsPathOf(p);
      let text = '';
      try{ text = await tauriInvoke('read_text_file_auto', { filePath: settingsPath }); }
      catch(e){ return; }
      const want = { 'window.hideTrayIcon':'true', 'window.startupInvisible':'true' };
      const lines = text.split(/\r?\n/);
      const done = {}; for(const k in want) done[k] = false;
      let inGlobal = false;
      for(let i=0;i<lines.length;i++){
        const line = lines[i];
        if(/^\s*\[/.test(line)){ inGlobal = /^\[Global\]/i.test(line.trim()); continue; }
        if(!inGlobal) continue;
        for(const k in want){
          if(new RegExp('^\\s*'+k.replace(/\./g,'\\.')+'\\s*=').test(line)){ lines[i] = k+'='+want[k]; done[k] = true; }
        }
      }
      const inserted = [];
      for(const k in want){ if(!done[k]) inserted.push(k+'='+want[k]); }
      if(inserted.length){
        for(let i=0;i<lines.length;i++){
          if(/^\[Global\]/i.test(lines[i].trim())){ lines.splice(i+1, 0, ...inserted); break; }
        }
      }
      await tauriInvoke('write_text_file', { filePath: settingsPath, content: lines.join('\r\n') });
    }catch(e){ /* best-effort，忽略 */ }
  }

  async function autoStartUmiOcr(){
    const p = await getStoredUmiPath();
    if(!p) return false;
    const tip = $('recUmiTip');
    const say = (t)=>{ if(tip) tip.innerHTML = t; };
    // 0) 先确保托盘图标已设为隐藏（写入配置，下次启动即生效）
    await ensureUmiTrayHidden();
    // Umi-OCR(Paddle) 首次冷启动要加载引擎，端口 1224 往往几十秒后才就绪
    // （本机实测约 60s 才进入 LISTENING）。之前 ~45s 的等待预算太短，会误报“启动失败”。
    // 这里放宽到 ~100s 并实时提示，避免被误判成卡死。
    try{ await tauriInvoke('start_umi_ocr', { exePath: p, hidden: true }); }catch(e){}
    say('已发送启动指令，Umi-OCR 引擎加载中（首次约需 1 分钟，请稍候，勿关闭助手）…');
    for(let i=0;i<100;i++){            // 最多 ~100s 等引擎就绪
      await sleep(1000);
      if(await probeUmiReady()) return true;
      if(i % 10 === 9) say('引擎加载中…（已等待 ' + (i+1) + 's，Umi-OCR 首次启动较慢属正常）');
    }
    // 2) 回退：显示窗口启动（Umi-OCR 已运行时再调一次会唤出已隐藏的窗口）
    try{ await tauriInvoke('start_umi_ocr', { exePath: p, hidden: false }); }catch(e){}
    for(let i=0;i<40;i++){
      await sleep(1000);
      if(await probeUmiReady()) return true;
    }
    return false;
  }

  // 仅查找本机 Umi-OCR.exe：扫描常见位置 → 记住路径 → 返回路径（找不到返回 null）。
  // 供 initUmiOnOpen / 启动引擎按钮复用（注意：本函数只负责“找+记”，不负责拉起，拉起由调用方 autoStartUmiOcr 完成）
  async function findUmiOcr(tip){
    tip = tip || $('recUmiTip');
    let found = null;
    try{ found = await tauriInvoke('find_umi_ocr'); }catch(e){ found = null; }
    if(found) await setStoredUmiPath(found);
    return found;
  }

  // 用系统默认浏览器打开 Umi-OCR 下载页（APP 内 target=_blank 被 Tauri 拦截，故走 open_url 命令）
  function openUmiDownload(){
    if(isTauri()){
      tauriInvoke('open_url', { url: UMI_OCR_DOWNLOAD })
        .catch(()=>{ try{ window.open(UMI_OCR_DOWNLOAD,'_blank'); }catch(_){} });
    } else {
      window.open(UMI_OCR_DOWNLOAD, '_blank');
    }
  }

  // 自动查找本机 Umi-OCR.exe（用户常不知道装在哪）：扫常见位置 → 记住 → 拉起
  async function findAndSetUmi(tip){
    tip = tip || $('recUmiTip');
    const st = $('recStatus');
    if(tip) tip.style.display = 'block'; // 操作期间确保提示区可见（“运行中”时默认隐藏，否则点了像没反应）
    if(tip) tip.innerHTML = '正在本机常见位置查找 Umi-OCR.exe （下载目录 / 桌面 / Program Files / Umi-OCR 文件夹）…';
    const found = await findUmiOcr(tip);
    if(found){
      if(tip) tip.innerHTML = '已找到：' + escapeHtml(found) + '，正在自动启动…';
      const ok = await autoStartUmiOcr();
      if(tip){
        if(ok) setTip(tip,'rgba(76,175,80,0.15)','#81c784','✅ 已自动找到并启动本机 Umi-OCR（离线精准识别）');
        else setTip(tip,'rgba(255,167,38,0.18)','#ffb74d','✅ 已记住路径：'+escapeHtml(found)+'，但启动失败，请手动双击打开 Umi-OCR 后重试。');
      }
      if(st) st.textContent = ok ? '✅ 已自动启动 Umi-OCR（离线识别可用）' : '⚠️ 找到路径但启动失败';
      return;
    }
    if(st) st.textContent = '⚠️ 未找到本机 Umi-OCR';
    if(tip) setTip(tip,'rgba(255,167,38,0.18)','#ffb74d',
      '🔍 未在本机常见位置找到 Umi-OCR.exe。'
      + 'Umi-OCR 是个<b>绿色压缩包</b>（不是安装程序）：先<a href="#" data-act="dl" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">下载</a>，解压到任意文件夹（例如 D:\\withfriends\\Umi-OCR），'
      + '解压后点「🔍 自动查找」或「选择 Umi-OCR.exe」指到解压出来的 <b>Umi-OCR.exe</b> 即可。');
  }

  // 根据 Rust 发来的 umi-ocr-download-progress 事件更新真实进度条
  function updateUmiDlProgress(p){
    const barEl = document.getElementById('recDLBar');
    const pctEl = document.getElementById('recDLPct');
    if(!barEl) return;
    p = p || {};
    if(p.stage === 'start'){ barEl.style.width = '2%'; if(pctEl) pctEl.textContent = '连接镜像中…'; return; }
    if(p.stage === 'progress'){
      const mb = (n)=> (n/1048576).toFixed(1);
      if(p.total && p.total > 0){
        const pct = Math.max(2, Math.min(100, Math.round(p.downloaded * 100 / p.total)));
        barEl.style.width = pct + '%';
        if(pctEl) pctEl.textContent = pct + '%  (' + mb(p.downloaded) + '/' + mb(p.total) + 'MB)';
      } else {
        barEl.style.width = '50%';
        if(pctEl) pctEl.textContent = '已下载 ' + mb(p.downloaded) + 'MB';
      }
      return;
    }
    if(p.stage === 'done' || p.stage === 'extract'){ barEl.style.width = '100%'; if(pctEl) pctEl.textContent = (p.stage==='extract' ? '下载完成，正在解压安装…' : '下载完成…'); return; }
  }

  // 一键下载并安装 Umi-OCR 到本助手数据目录（不散落到浏览器默认下载目录），随后自动配置并拉起
  async function downloadAndInstallUmi(tip){
    tip = tip || $('recUmiTip');
    const st = $('recStatus');
    const btn = $('recInstall');
    if(window._umiDownloading) return; // 防重复点击
    window._umiDownloading = true;
    // 立即反馈：禁用按钮 + 变更文案（点了和没点一眼区分）
    if(btn){ btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '⏳ 下载中…'; btn.style.opacity = '0.6'; btn.style.cursor = 'wait'; }
    // 真实进度条（Rust 通过 umi-ocr-download-progress 事件回传已下载/总字节，前端据此填充）
    const bar = '<div id="recDLWrap" style="margin:8px 0 2px;height:10px;border-radius:6px;background:rgba(255,255,255,0.12);overflow:hidden;">'
      + '<div id="recDLBar" style="height:100%;width:2%;border-radius:6px;background:linear-gradient(90deg,#26c6da,#00838f);transition:width .25s;"></div></div>'
      + '<div id="recDLPct" style="font-size:0.72rem;color:#b2ebf2;margin-top:2px;">准备下载…</div>';
    if(tip) tip.innerHTML = '正在从 Gitee 国内加速下载 Umi-OCR（约 130MB，分 2 卷，请耐心等待，勿关闭助手）…' + bar;
    if(st) st.textContent = '下载安装中…';
    let path = null;
    let unlisten = null;
    try{
      // 监听 Rust 下载进度事件，实时刷新进度条（避免“是不是卡死”的困惑）
      if(window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen){
        unlisten = await window.__TAURI__.event.listen('umi-ocr-download-progress', (e)=>{ updateUmiDlProgress(e && e.payload); });
      }
      path = await tauriInvoke('download_umi_ocr');
    }
    catch(e){
      const msg = (e && e.message || e) + '';
      if(window._umiDlFailCount == null) window._umiDlFailCount = 0;
      window._umiDlFailCount++;
      const times = window._umiDlFailCount;
      const dlDir = 'D:\\withfriends\\塔防精灵助手数据\\Umi-OCR';
      const manual = '① 点 <a href="#" data-act="dl" style="color:#4fc3f7;text-decoration:underline;">🌐 手动下载</a>（或打开 <span style="color:#ffd54f;">'+UMI_OCR_DOWNLOAD+'</span> 下 <b>Umi-OCR_Paddle_v2.1.5</b> 版）<br>'
        + '② 把下载的 <b>Umi-OCR_Paddle_v2.1.5.7z.exe</b> 自解压包<b>解压</b>到：<br>'
        + '<b style="color:#ffd54f;word-break:break-all;">'+dlDir+'</b><br>（解压后会生成 <b>Umi-OCR_Paddle_v2.1.5</b> 文件夹）<br>'
        + '③ 回来点「🔍 自动查找」或「选择 Umi-OCR.exe」指向里面的 <b>Umi-OCR.exe</b>';
      const head = times >= 2
        ? '⚠️ 已自动下载失败 <b>'+times+'</b> 次，建议改用手动下载：'
        : '⚠️ 自动下载失败：'+escapeHtml(msg)+'。可重试，或按下面手动下载：';
      const failHtml = head + '<div style="margin-top:6px;line-height:1.75;font-size:0.82rem;">' + manual
        + '<div style="margin-top:8px;"><a href="#" data-act="install" style="color:#4fc3f7;text-decoration:underline;margin-right:14px;">🔄 重试自动下载</a>'
        + '<a href="#" data-act="find" style="color:#4fc3f7;text-decoration:underline;">🔍 我已放好，去查找</a></div></div>';
      if(tip) setTip(tip,'rgba(255,167,38,0.18)','#ffb74d', failHtml);
      if(st) st.textContent = '下载失败';
      window._umiDownloading = false;
      if(btn){ btn.disabled = false; btn.textContent = btn.dataset.label || '⬇ 下载安装'; btn.style.opacity=''; btn.style.cursor='pointer'; }
      return;
    }
    finally{ if(unlisten){ try{ unlisten(); }catch(_){} } }
    window._umiDownloading = false;
    window._umiDlFailCount = 0;
    if(btn){ btn.disabled = false; btn.textContent = '✅ 已安装'; btn.style.opacity=''; btn.style.cursor='pointer'; }
    if(!path){ if(st) st.textContent='下载完成但未找到程序'; return; }
    await setStoredUmiPath(path);
    if(tip) tip.innerHTML = '已下载并解压到：' + escapeHtml(path) + '，正在自动启动…';
    const ok = await autoStartUmiOcr();
    if(tip){
      if(ok) setTip(tip,'rgba(76,175,80,0.15)','#81c784','✅ 已下载安装并自动启动本机 Umi-OCR（离线精准识别）');
      else setTip(tip,'rgba(255,167,38,0.18)','#ffb74d','✅ 已安装到 '+escapeHtml(path)+'，但启动失败，请手动双击打开 Umi-OCR 后重试。');
    }
    if(st) st.textContent = ok ? '✅ 已自动启动 Umi-OCR' : '⚠️ 已安装但启动失败';
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

  // 把状态做成醒目的彩色药丸（🟢运行中 / 🔴异常 / 🟡进行中）
  function setStatusPill(el, icon, text){
    if(!el) return;
    el.textContent = icon + ' ' + text;
    el.style.padding = '3px 12px';
    el.style.borderRadius = '12px';
    el.style.fontWeight = '700';
    el.style.fontSize = '0.82rem';
    el.style.display = 'inline-block';
    if(icon === '🟢'){ el.style.background = 'rgba(76,175,80,0.22)'; el.style.color = '#81c784'; }
    else if(icon === '🔴'){ el.style.background = 'rgba(244,67,54,0.22)'; el.style.color = '#ff8a80'; }
    else { el.style.background = 'rgba(255,167,38,0.22)'; el.style.color = '#ffb74d'; }
  }

  // 打开阵容识别时：先检测本地引擎状态 → 未运行则自动无感启动 → 失败则醒目引导排查/下载
  async function initUmiOnOpen(){
    const tip = $('recUmiTip');
    const st = $('recStatus');
    if(!isTauri()){
      if(tip) tip.style.display = 'none';
      setStatusPill(st, '🔴', '浏览器环境不支持本地 OCR（请用桌面版 App）');
      return;
    }
    if(tip) tip.style.display = 'block';
    setStatusPill(st, '🟡', '检测 Umi-OCR 状态中…');
    const av = await checkUmiOcrAvailable();
    if(av === true){
      setStatusPill(st, '🟢', 'Umi-OCR 运行中（离线识别可用）');
      if(tip) tip.style.display = 'none';
      return;
    }
    // 未运行：若已记住路径则先尝试自动无感拉起（路径可能失效/文件已移动）
    const stored = await getStoredUmiPath();
    if(stored){
      setStatusPill(st, '🟡', '未检测到引擎，正在自动启动…');
      if(await autoStartUmiOcr()){
        setStatusPill(st, '🟢', 'Umi-OCR 已自动启动（离线识别可用）');
        if(tip) tip.style.display = 'none';
        return;
      }
      // 记住的路径启动失败（多半是路径失效）→ 不阻塞，继续自动查找新位置
    }
    // 自动查找本机 Umi-OCR（找到后更新记住的路径并自动拉起）
    const found = await findUmiOcr(tip);
    if(found){
      await autoStartUmiOcr(); // 找到后真正拉起引擎（之前漏了这步，会误报“启动失败”）
      const ok2 = await checkUmiOcrAvailable();
      if(ok2 === true){
        setStatusPill(st, '🟢', 'Umi-OCR 已自动启动（离线识别可用）');
        if(tip) tip.style.display = 'none';
      } else {
        setStatusPill(st, '🔴', 'Umi-OCR 启动失败，请排查');
        setTip(tip, 'rgba(244,67,54,0.18)', '#ff8a80',
          '⚠️ <b>已找到 Umi-OCR 但启动失败</b>：<code style="font-size:0.72rem;">' + escapeHtml(found) + '</code><br>'
          + '① 是否被杀毒软件拦截<br>'
          + '② 点「🚀 启动识别引擎」手动启动，或重装：'
          + '<a href="#" data-act="install" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">⬇ 一键下载安装</a>'
          + '<a href="#" data-act="find" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">🔍 重新查找</a>'
          + '<a href="#" id="recPickUmi" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">选择 exe</a>'
          + '<br><br>' + umiSettingsGuideHtml());
        bindPickUmi(tip);
      }
      return;
    }
    // 从未配置：引导三种方式
    setStatusPill(st, '🔴', '未配置 Umi-OCR');
    setTip(tip, 'rgba(255,167,38,0.18)', '#ffb74d',
      '⚠️ 阵容识别依赖本机 <b>Umi-OCR</b>（免费开源、绿色软件，不打包进安装包）。三种方式搞定：'
      + '<a href="#" data-act="install" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">⬇ 一键下载安装</a>（自动装到本助手目录）'
      + '<a href="#" data-act="find" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">🔍 自动查找</a>'
      + '<a href="#" id="recPickUmi" style="color:#4fc3f7;text-decoration:underline;margin:0 4px;">选择 exe</a>'
      + '（或<a href="#" data-act="dl" style="color:#4fc3f7;text-decoration:underline;">浏览器下载</a>后解压到 D:\\withfriends\\塔防精灵助手数据\\Umi-OCR）。配好后助手会<b>自动后台启动</b>。'
      + '<br><br>' + umiSettingsGuideHtml());
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
        options: { data:{format:'dict', outputDirName:'', outputFileName:'', outputFileFormat:[]}, ocr:{language:'models/config_chinese.txt', cls:true} }
      });
      if(j && j.code===100) return {items: j.data||[], source:'Umi-OCR(桥接)'};
      if(j && j.code===101) return {items:[], source:'Umi-OCR(空)'};
      throw new Error(typeof j==='string'?j:(j&&j.data)||'Umi-OCR 返回异常');
    }
    // 开发环境：本地代理（tools/server.js）
    const resp = await fetch('/umi-ocr', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({base64:b64, options:{data:{format:'dict', outputDirName:'', outputFileName:'', outputFileFormat:[]}, ocr:{language:'models/config_chinese.txt', cls:true}}})});
    if(resp.ok){ const j = await resp.json(); if(j.code===100) return {items:j.data||[], source:'Umi-OCR(代理)'}; }
    throw new Error('本功能需要本机 Umi-OCR（免费开源），未安装则不支持识别。请在桌面端安装并双击打开 Umi-OCR 后重试。');
  }

  // ====================== 自动识别主流程 ======================
  function autoRecognize(img, canvas, statusEl, onDone){
    if(typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('阵容识别');
    if(!img){ alert('请先粘贴或选择一张截图'); return; }
    const _bar = document.getElementById('recProgressBar');
    const _stage = document.getElementById('recStage');
    const _showBar = (txt)=>{ if(_bar) _bar.style.display='block'; if(_stage){ _stage.style.display='inline'; _stage.textContent=txt; } statusEl.textContent='识别中…'; };
    const _hideBar = ()=>{ if(_bar) _bar.style.display='none'; if(_stage) _stage.style.display='none'; };
    _showBar('① 发送截图到本地 Umi-OCR 引擎…');
    // 发送极快，约 0.7s 后切到“引擎识别中”（Umi-OCR 单次 HTTP 不回传真实进度，故用阶段标注而非假百分比）
    const _stageTimer = setTimeout(()=>{ if(_stage) _stage.textContent='② 引擎识别中（本地 Paddle 推理）…'; }, 700);
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
      clearTimeout(_stageTimer); _hideBar();
      onDone(results, source, rows.length);
    }).catch(e=>{
      clearTimeout(_stageTimer); _hideBar();
      const m = (e && e.message) ? e.message
        : (typeof e === 'string' ? e : ((e && JSON.stringify(e)) || '未知错误'));
      statusEl.textContent='识别失败'; alert('识别失败: '+m);
    });
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

  // ====================== 自定义弹窗（替代 window.prompt/confirm，Tauri 下原生 prompt 不工作） ======================
  function recCloseModal(id){ const d=document.getElementById(id); if(d) d.remove(); }
  function recChoice(opts){
    const id = 'recChoiceModal'; recCloseModal(id);
    const ov = document.createElement('div');
    ov.id = id;
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;padding:18px;';
    const box = document.createElement('div');
    const _mh = opts.maxHeight || '78vh';
    box.style.cssText = 'background:#1b1f2a;color:#eee;border-radius:12px;max-width:440px;width:100%;max-height:'+_mh+';overflow-y:auto;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    let html = '<div style="font-size:1.05rem;font-weight:600;margin-bottom:6px;">' + escapeHtml(opts.title||'') + '</div>';
    if(opts.desc) html += '<div style="font-size:0.82rem;color:#b0bec5;margin-bottom:12px;line-height:1.5;">' + escapeHtml(opts.desc) + '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    (opts.items||[]).forEach(it=>{
      const st = it.style || 'background:linear-gradient(135deg,#42a5f5,#1565c0);color:#fff;border:none;';
      html += '<button data-v="' + escapeHtml(String(it.value)) + '" style="' + st + 'padding:10px 14px;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:600;text-align:left;">' + escapeHtml(it.label) + '</button>';
    });
    html += '</div>';
    if(opts.onBack) html += '<button data-back style="margin-top:10px;width:100%;background:rgba(79,195,247,0.14);color:#4fc3f7;border:1px solid rgba(79,195,247,0.35);padding:8px;border-radius:8px;cursor:pointer;font-weight:600;">← 返回上一步</button>';
    if(opts.onCancel) html += '<button data-cancel style="margin-top:8px;width:100%;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px;border-radius:8px;cursor:pointer;">取消</button>';
    box.innerHTML = html;
    ov.appendChild(box); document.body.appendChild(ov);
    const close = ()=> recCloseModal(id);
    box.querySelectorAll('button[data-v]').forEach(b=>{ b.onclick = ()=>{ const v=b.getAttribute('data-v'); close(); opts.onPick && opts.onPick(v); }; });
    if(opts.onBack) box.querySelector('button[data-back]').onclick = ()=>{ close(); opts.onBack(); };
    if(opts.onCancel) box.querySelector('button[data-cancel]').onclick = ()=>{ close(); opts.onCancel(); };
    ov.onclick = (e)=>{ if(e.target===ov && opts.onCancel) { close(); opts.onCancel(); } };
  }
  function recInput(opts){
    const id = 'recInputModal'; recCloseModal(id);
    const ov = document.createElement('div');
    ov.id = id;
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;padding:18px;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1b1f2a;color:#eee;border-radius:12px;max-width:420px;width:100%;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    box.innerHTML = '<div style="font-size:1.05rem;font-weight:600;margin-bottom:10px;">' + escapeHtml(opts.title||'') + '</div>'
      + '<input id="recInputBox" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);background:rgba(0,0,0,0.3);color:#fff;font-size:0.9rem;" placeholder="' + escapeHtml(opts.placeholder||'') + '" value="' + escapeHtml(opts.def||'') + '">'
      + '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button id="recInputOk" style="flex:1;background:linear-gradient(135deg,#66bb6a,#2e7d32);color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:600;">确定</button>'
      + '<button id="recInputCancel" style="flex:1;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:10px;border-radius:8px;cursor:pointer;">取消</button>'
      + '</div>';
    ov.appendChild(box); document.body.appendChild(ov);
    const inp = box.querySelector('#recInputBox');
    const close = ()=> recCloseModal(id);
    setTimeout(()=> inp.focus(), 30);
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ close(); opts.onOk && opts.onOk(inp.value); } });
    box.querySelector('#recInputOk').onclick = ()=>{ close(); opts.onOk && opts.onOk(inp.value); };
    box.querySelector('#recInputCancel').onclick = ()=>{ close(); opts.onCancel && opts.onCancel(); };
    ov.onclick = (e)=>{ if(e.target===ov){ close(); opts.onCancel && opts.onCancel(); } };
  }
  function recToast(msg){
    if(typeof showToast === 'function'){ showToast(msg); return; }
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);background:rgba(20,20,35,0.95);color:#fff;padding:12px 18px;border-radius:10px;font-size:0.86rem;z-index:30000;max-width:80%;box-shadow:0 6px 24px rgba(0,0,0,0.5);line-height:1.5;white-space:pre-line;';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(()=> t.remove(), 4000);
  }

  // ====================== UI：浮窗按钮 + 弹窗 ======================
  function buildUI(){
    const btn = document.createElement('div');
    btn.textContent = '📷 阵容识别';
    btn.title = '粘贴/选择战斗截图，自动识别 10 张英雄卡';
    btn.setAttribute('data-tip', '阵容识别：粘贴或选择战斗截图，自动识别 10 张英雄卡（依赖本机 Umi-OCR 离线引擎）');
    Object.assign(btn.style, {
      position:'fixed', bottom:'72px', right:'10px', zIndex:'9999',
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
          <div id="recProgressBar" style="display:none;margin:6px 0 2px;height:10px;border-radius:6px;background:rgba(255,255,255,0.12);overflow:hidden;">
            <div style="height:100%;width:42%;border-radius:6px;background:linear-gradient(90deg,#26c6da,#00838f);animation:recDL 1.1s ease-in-out infinite;"></div>
          </div>
          <span id="recStage" style="display:none;font-size:0.72rem;color:#90caf9;"></span>
          <span style="cursor:pointer;font-size:1.3rem;padding:0 6px;" id="recClose">✕</span>
        </div>
        <div id="recUmiTip" style="display:none;font-size:0.78rem;margin-bottom:10px;padding:7px 10px;border-radius:8px;line-height:1.5;"></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:280px;">
            <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <input type="file" id="recFile" accept="image/*" style="display:none;">
              <button id="recPickFile" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.28);color:#fff;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.8rem;">📁 选择阵容图片</button>
              <span id="recFileName" style="font-size:0.78rem;color:#90a4ae;">未选择阵容图片</span>
              <span style="font-size:0.75rem;color:#90a4ae;">｜也可直接 Ctrl+V 粘贴截图</span>
            </div>
            <canvas id="recCanvas" style="width:100%;max-height:46vh;background:#000;border-radius:8px;display:block;"></canvas>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
              <button id="recAuto" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600;">⚡ 自动识别(无需对齐)</button>
              <button id="recFill" style="background:linear-gradient(135deg,#42a5f5,#1565c0);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;">➡ 填入脚本生成</button>
              <button id="recImportHand" style="background:linear-gradient(135deg,#66bb6a,#2e7d32);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600;">🃏 导入到手牌</button>
              <button id="recLaunch" style="background:linear-gradient(135deg,#ff9800,#e65100);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600;" title="关掉 Umi-OCR 后，点此重新打开它">🚀 启动识别引擎</button>
              <button id="recFind" style="background:linear-gradient(135deg,#ab47bc,#6a1b9a);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600;" title="本机找不到 Umi-OCR 装哪了？点此自动扫描常见位置">🔍 自动查找</button>
              <button id="recInstall" style="background:linear-gradient(135deg,#26c6da,#00838f);color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600;" title="一键把 Umi-OCR 下载安装到咱们的数据目录">⬇ 下载安装</button>
            </div>
            <div style="font-size:0.72rem;color:#789;margin-top:6px;">识别只认 100 个精确英雄卡名（皮肤不参与）；不在 100 库内即判“疑似识别错”。识别不到的请手动修改。</div>
          </div>
          <div style="flex:1;min-width:280px;overflow:auto;max-height:60vh;">
            <div id="recWarn" style="display:none;font-size:0.78rem;color:#ffb74d;background:rgba(255,167,38,0.15);padding:6px 10px;border-radius:8px;margin-bottom:8px;line-height:1.5;"></div>
            <div id="recIntro" style="font-size:0.82rem;line-height:1.75;color:#cfd8dc;background:rgba(66,165,245,0.10);border:1px solid rgba(66,165,245,0.28);border-radius:10px;padding:12px 14px;">
              <div style="font-weight:700;color:#90caf9;margin-bottom:8px;font-size:0.9rem;">📖 使用说明（识别结果会显示在这里）</div>
              <div style="margin-bottom:4px;"><b style="color:#fff;">① 取图</b>：游戏里截下<b>卡组阵容图</b>，直接 <b style="color:#ffd54f;">Ctrl+V 粘贴</b>到左侧黑框内，或点「📁 选择阵容图片」。</div>
              <div style="margin-bottom:4px;"><b style="color:#fff;">② 识别</b>：点绿色「⚡ 自动识别(无需对齐)」，稍等片刻，10 张英雄卡会逐行列在此处。</div>
              <div style="margin-bottom:4px;"><b style="color:#fff;">③ 用结果（任选其一，或都用）</b>：</div>
              <div style="padding-left:14px;margin-bottom:2px;">• 「➡ 填入脚本生成」→ 直接生成上阵脚本；</div>
              <div style="padding-left:14px;margin-bottom:8px;">• 「🃏 导入到手牌」→ 放进阵容手牌（可选我的/队友、指定项目）。</div>
              <div style="color:#9fb3c8;">识别错/多出来的行，点该行「✕ 删」去掉再使用即可。</div>
              <div style="margin-top:10px;padding-top:9px;border-top:1px dashed rgba(255,255,255,0.18);color:#ffb74d;">
                ⏳ <b>第一次打开会自动安装识别引擎，稍慢一些，仅此一次</b>；每台电脑性能不同，快慢有差异，请耐心等待，装好后以后打开就快了。
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
              <thead><tr style="text-align:left;color:#90caf9;">
                <th style="padding:4px;">#</th><th>OCR原文</th><th>英雄</th><th>校验(100库)</th><th>操作</th>
              </tr></thead>
              <tbody id="recBody"></tbody>
            </table>
            <div id="recDrCard" style="display:none;margin-top:12px;padding:12px 14px;background:rgba(78,205,196,0.10);border:1px solid rgba(78,205,196,0.3);border-radius:10px;"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // 下载进度条动画（不确定进度，Rust 当前不发进度事件）
    if(!document.getElementById('recDlStyle')){
      const s = document.createElement('style'); s.id = 'recDlStyle';
      s.textContent = '@keyframes recDL{0%{margin-left:-42%}100%{margin-left:100%}}';
      document.head.appendChild(s);
    }
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
    const recPickBtn = $('recPickFile');
    if(recPickBtn) recPickBtn.onclick = ()=> $('recFile').click();
    $('recFile').onchange = (e)=>{
      const f = e.target.files[0];
      if(f){ loadImg(f); const n=$('recFileName'); if(n){ n.textContent = '已选：'+f.name; n.style.color = '#81c784'; } }
    };
    document.addEventListener('paste', (e)=>{
      if(overlay.style.display==='none') return;
      const it = e.clipboardData && e.clipboardData.items && [...e.clipboardData.items].find(i=>i.type&&i.type.startsWith('image/'));
      if(it){ const f=it.getAsFile(); if(f){ e.preventDefault(); loadImg(f); const n=$('recFileName'); if(n){ n.textContent='已粘贴截图'; n.style.color='#81c784'; } } }
    });
    // 超量识别（>10）提示：有人把卡组名叫英雄名会多识别，需手动删多余卡
    function updateRecWarn(results){
      const warn = $('recWarn');
      if(!warn) return;
      const remaining = results.filter(r=>!r._deleted);
      if(remaining.length > 10){
        warn.style.display = 'block';
        warn.innerHTML = '⚠️ 识别到 <b>'+remaining.length+'</b> 个卡（标准应为 10 张）。可能有人把<b>卡组名</b>起了英雄名导致多识别，请在多余行的「✕ 删」去掉，否则灌入脚本生成会出错。';
      } else {
        warn.style.display = 'none';
      }
    }

    // 识别结果减伤展示（与脚本解析面板的减伤计算一致：前7 + 全 + 单卡明细，可切换减伤表）
    function renderRecDr(results){
      const card = $('recDrCard');
      if(!card) return;
      if(typeof window.calculateDamageReductionForCards !== 'function'){ card.style.display = 'none'; return; }
      if(window.loadDamageReductionData) window.loadDamageReductionData();
      const heroes = (results||[]).filter(r=>!r._deleted && r.valid && r.valid.ok).map(r=>r.hero);
      const isSpirit = (n)=> n.includes('精灵') || n==='幻球' || n==='冰球';
      const battle = heroes.filter(c=>!isSpirit(c));
      if(battle.length === 0){ card.style.display = 'none'; return; }
      // 🔴 当前查看的减伤表（可下拉切换；默认「我的」）
      let tbl = window._recDrTable;
      if(!tbl || !window.drTables || !window.drTables[tbl]) tbl = (window.drActiveTable) || '我的';
      window._recDrTable = tbl;
      const allDr = window.calculateDamageReductionForCards(battle, 'my', tbl);
      const first7 = battle.slice(0,7);
      const first7Dr = window.calculateDamageReductionForCards(first7, 'my', tbl);
      let c1 = first7Dr<100?'#ff6b6b':first7Dr<130?'#ffd700':'#4ecdc4';
      let c2 = allDr<100?'#ff6b6b':allDr<130?'#ffd700':'#4ecdc4';
      const details = battle.slice(0,15).map(n=>{
        const d = window.calculateDamageReductionForCards([n],'my',tbl,true);
        const c = d<30?'#ff6b6b':d<50?'#ffd700':'#4ecdc4';
        return `${n}:<b style="color:${c}">${d}%</b>`;
      });
      // 减伤表切换下拉
      let selHtml = '';
      if(typeof window.drTableSelectOptions === 'function'){
        selHtml = `<select id="recDrTableSel" onchange="window.switchRecDrTable(this.value)" title="切换减伤表" style="margin-left:8px;font-size:0.72rem;background:rgba(0,0,0,0.35);border:1px solid rgba(78,205,196,0.4);color:#4ecdc4;padding:2px 6px;border-radius:6px;cursor:pointer;">${window.drTableSelectOptions(tbl)}</select>`;
      }
      card.style.display = 'block';
      card.innerHTML = `<div style="font-size:0.78rem;color:#4ecdc4;font-weight:700;margin-bottom:6px;">🛡️ 识别到的卡 · 减伤${selHtml}</div>
        <div style="display:flex;gap:14px;font-size:0.92rem;margin-bottom:6px;">
          <span>前7张：<b style="color:${c1}">${first7Dr}%</b></span>
          <span>全部：<b style="color:${c2}">${allDr}%</b></span>
        </div>
        <div style="font-size:0.74rem;color:rgba(255,255,255,0.75);line-height:1.6;">📋 单卡：${details.join(' ｜ ')}</div>`;
    }
    // 识别结果减伤表切换
    window.switchRecDrTable = function(name){
      if(!name || !window.drTables || !window.drTables[name]) return;
      window._recDrTable = name;
      if(overlay && overlay._results) renderRecDr(overlay._results);
    };

    $('recAuto').onclick = ()=>{
      autoRecognize(currentImg, $('recCanvas'), $('recStatus'), (results, source, rowCount)=>{
        $('recSrc').textContent = '来源: '+source;
        const intro = $('recIntro'); if(intro && results && results.length) intro.style.display = 'none';
        const tb = $('recBody'); tb.innerHTML='';
        results.forEach(r=>{
          r._deleted = false;
          const tr = document.createElement('tr');
          tr.style.borderTop = '1px solid #333';
          tr.innerHTML = `<td style="padding:4px;color:#90a4ae;">${r.idx}</td>
            <td style="padding:4px;">${r.text}</td>
            <td style="padding:4px;font-weight:600;color:#fff;">${r.hero}</td>
            <td style="padding:4px;">${validCellHtml(r.valid)}</td>
            <td style="padding:4px;"><button data-del="${r.idx}" title="删除这张（识别多了就删掉）" style="background:rgba(244,67,54,0.25);color:#ff8a80;border:none;border-radius:6px;cursor:pointer;padding:2px 8px;font-size:0.72rem;">✕ 删</button></td>`;
          tb.appendChild(tr);
        });
        // 绑定删除
        tb.querySelectorAll('button[data-del]').forEach(b=>{
          b.onclick = ()=>{
            const id = +b.getAttribute('data-del');
            const r = results.find(x=>x.idx===id);
            if(r) r._deleted = true;
            const tr = b.closest('tr');
            if(tr){ tr.style.opacity='0.35'; tr.style.textDecoration='line-through'; }
            updateRecWarn(results);
            renderRecDr(results); // 删除后刷新减伤
          };
        });
        overlay._results = results;
        updateRecWarn(results);
        $('recStatus').textContent = `识别完成：${results.length} 个英雄（${rowCount} 行）`;
        renderRecDr(results); // 识别完立即算并展示减伤
      });
    };
    $('recFill').onclick = ()=>{
      const all = overlay._results || [];
      const results = all.filter(r=>!r._deleted);
      if(!results.length){ alert('请先识别（或别把卡都删光了）'); return; }
      const heroes = results.filter(r=>r.valid && r.valid.ok).map(r=>r.hero);
      if(!heroes.length){ alert('没有通过校验的英雄可填入'); return; }
      if(typeof selectQuickCard === 'function'){
        heroes.forEach(h=> selectQuickCard(h));
        $('recStatus').textContent = `已填入 ${heroes.length} 个英雄到脚本生成`;
      } else {
        // 兜底：直接写 #parserInput
        const ta = $('parserInput');
        if(ta){ ta.value = '上阵：' + heroes.join(','); ta.dispatchEvent(new Event('input')); }
      }
      // 打开“脚本生成”界面，让用户直接看到灌入结果
      const p = $('txtFilesPanel');
      if(p && p.style.display === 'none' && typeof toggleTxtFilesPanel === 'function') toggleTxtFilesPanel();
      setTimeout(()=>{ overlay.style.display='none'; }, 600);
    };

    // 🃏 导入到手牌：选框(当前/新建/现有项目) → 选我的/队友手牌 → 逐张加入
    // 注意：Tauri 桌面端 window.prompt 不工作，改用自定义 modal（recChoice/recInput/recToast）
    $('recImportHand').onclick = async ()=>{
      const all = overlay._results || [];
      const results = all.filter(r=>!r._deleted);
      if(!results.length){ recToast('请先识别（或别把卡都删光了）'); return; }
      // 仅取通过 100 库校验的英雄（疑似识别错/未通过者一律跳过）
      const heroes = results.filter(r=>r.valid && r.valid.ok && r.hero).map(r=>r.hero);
      const skipped = results.length - heroes.length;
      if(!heroes.length){ recToast('没有通过校验的英雄（100 精确英雄卡名）可导入手牌。\n识别不到的请手动修改。'); return; }

      const curName = (typeof currentProjectName !== 'undefined' && currentProjectName) ? currentProjectName : '';
      // loadProjectListFromDB 是异步的（返回 Promise），必须 await，否则 existing 为 Promise 导致 forEach 抛错
      let existing = [];
      try { if(typeof loadProjectListFromDB === 'function') existing = (await loadProjectListFromDB()) || []; } catch(e){ existing = []; }

      const addToHandByName = (name, type)=>{
        const cardEl = document.querySelector('.card-item[data-name="' + name + '"]');
        if(!cardEl) return false;
        const target = type === 'teammate' ? teammateHandCards : myHandCards;
        const id = cardEl.dataset.id;
        const isEng = cardEl.dataset.engineering === 'true';
        const prof = cardEl.dataset.profession;
        const ctype = cardEl.dataset.type;
        if(target.some(c=>c.id===id) || (typeof handHasIdentity==='function' && handHasIdentity(target, name))) return false;
        if(target.length >= MAX_HAND_CARDS) return false;
        target.push({ id:id, name:name, placed:null, isEngineering:isEng, profession:prof, type:ctype });
        return true;
      };

      const doImport = (projName, type)=>{
        if(!type) type='my';
        let added=0, dup=0, missing=0;
        heroes.forEach(h=>{
          const before=(type==='my'?myHandCards:teammateHandCards).length;
          const ok=addToHandByName(h,type);
          const after=(type==='my'?myHandCards:teammateHandCards).length;
          if(ok) added++; else if(after===before) dup++; else missing++;
        });
        if(typeof updateHandDisplay==='function') updateHandDisplay(type);
        if(typeof saveCurrentProject==='function') saveCurrentProject();
        let msg='已导入 '+added+' 张到'+(type==='my'?'我的':'队友')+'手牌'+(projName?'（项目：'+projName+'）':'');
        if(dup>0) msg+='；'+dup+' 张因重复已跳过';
        if(missing>0) msg+='；'+missing+' 张卡池未找到（请确认卡池含该英雄）';
        if(skipped>0) msg+='；'+skipped+' 张未通过 100 库校验已忽略（识别不到的请手动修改）';
        recToast(msg);
        $('recStatus').textContent = msg;
      };

      // 选择目标：用「分类 + 项目」两个下拉框（跟项目原生选择器一致，更直观），
      // 项目下拉随分类过滤，选「➕ 新建项目」则弹名，选「📌 当前项目」直接走当前项目
      const cats = [];
      existing.forEach(n=>{ const c=(n&&n.category)||'默认分类'; if(cats.indexOf(c)<0) cats.push(c); });
      // 当前项目所在分类（没有则默认第一个分类，再没有则「默认分类」）
      const curCat = (curName && existing.find(n=>n.name===curName)) ? ((existing.find(n=>n.name===curName).category)||'默认分类') : (cats[0]||'默认分类');
      const byCat = (cat)=> existing.map((n,i)=>({name:(n&&n.name?n.name:n), idx:i, cat:(n&&n.category)||'默认分类'})).filter(p=>p.cat===cat);

      const openPicker = ()=>{
        const m = document.createElement('div');
        m.id = 'recImportModal'; recCloseModal('recImportModal');
        m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;padding:18px;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#1b1f2a;color:#eee;border-radius:12px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
        box.innerHTML =
          '<div style="font-size:1.05rem;font-weight:600;margin-bottom:4px;">🃏 导入到手牌 — 选择项目</div>' +
          '<div style="font-size:0.82rem;color:#b0bec5;margin-bottom:14px;line-height:1.5;">把这 '+heroes.length+' 张英雄卡导入到？（先选分类，再选项目）</div>' +
          '<label style="font-size:0.8rem;color:#90caf9;display:block;margin-bottom:6px;">📁 分类（文件夹）</label>' +
          '<select id="recImpCat" style="width:100%;box-sizing:border-box;background:#2a2a4a;color:#fff;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);font-size:0.9rem;cursor:pointer;margin-bottom:14px;"></select>' +
          '<label style="font-size:0.8rem;color:#90caf9;display:block;margin-bottom:6px;">📄 项目（文件夹里的文件）</label>' +
          '<select id="recImpProj" style="width:100%;box-sizing:border-box;background:#2a2a4a;color:#fff;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);font-size:0.9rem;cursor:pointer;margin-bottom:16px;"></select>' +
          '<div style="font-size:0.8rem;color:#90caf9;margin-bottom:6px;">导入到哪个手牌？</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:16px;">' +
            '<button data-type="my" style="flex:1;background:linear-gradient(135deg,#42a5f5,#1565c0);color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:600;">🃏 我的手牌</button>' +
            '<button data-type="teammate" style="flex:1;background:linear-gradient(135deg,#66bb6a,#2e7d32);color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:600;">🤝 队友手牌</button>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button id="recImpCancel" style="flex:1;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:9px;border-radius:8px;cursor:pointer;">取消</button>' +
            '<button id="recImpOk" style="flex:1;background:linear-gradient(135deg,#ffd700,#ff6b6b);color:#1a1a2e;border:none;padding:9px;border-radius:8px;cursor:pointer;font-weight:600;">✅ 确认导入</button>' +
          '</div>';
        m.appendChild(box); document.body.appendChild(m);

        const catSel = box.querySelector('#recImpCat');
        const projSel = box.querySelector('#recImpProj');
        const fillCats = ()=>{
          catSel.innerHTML = '';
          cats.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent='📁 '+c; catSel.appendChild(o); });
          // 当前项目选项（若存在）
          if(curName){ const o=document.createElement('option'); o.value='__CUR__'; o.textContent='📌 当前项目（'+curName+'）'; catSel.appendChild(o); }
          catSel.value = curName ? '__CUR__' : (cats.indexOf(curCat)>=0?curCat:cats[0]||'默认分类');
          fillProjs();
        };
        const fillProjs = ()=>{
          projSel.innerHTML = '';
          const c = catSel.value;
          let list = [];
          if(c==='__CUR__'){ list = byCat(curCat); }
          else { list = byCat(c); }
          list.forEach(p=>{ const o=document.createElement('option'); o.value=String(p.idx); o.textContent='📄 '+p.name; projSel.appendChild(o); });
          const o2=document.createElement('option'); o2.value='__NEW__'; o2.textContent='📄 新建项目…'; projSel.appendChild(o2);
          if(!list.length && !curName){ projSel.value='__NEW__'; }
        };
        catSel.onchange = fillProjs;
        fillCats();

        const close = ()=> recCloseModal('recImportModal');
        box.querySelector('#recImpCancel').onclick = ()=> close();
        m.onclick = (e)=>{ if(e.target===m) close(); };
        box.querySelector('#recImpOk').onclick = ()=>{
          const pval = projSel.value;
          const type = box.querySelector('button[data-type].sel') ? box.querySelector('button[data-type].sel').getAttribute('data-type') : null;
          if(!type){ recToast('请先选择导入到「我的手牌」还是「队友手牌」'); return; }
          if(typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('阵容识别导入' + (type === 'teammate' ? '(队友)' : '(我方)'));
          if(pval==='__NEW__'){
            close();
            recInput({
              title:'新建项目名称',
              placeholder:'输入新项目名称',
              def:'新阵容',
              onOk:(nm)=>{
                const safe=(nm||'').trim();
                if(!safe){ recToast('项目名不能为空'); return; }
                const cat = (catSel.value==='__CUR__') ? curCat : (catSel.value||'默认分类');
                const emptyData={ myHandCards:[], teammateHandCards:[], myPlacedCards:[], teammatePlacedCards:[], cardLevels:{}, cardSkins:{}, fusionSkins:{}, myDeckInfo:'', teammateDeckInfo:'', notepad:'', txtFiles:[], referenceImages:[] };
                if(typeof saveProjectToDB==='function' && typeof loadProjectFromDB==='function'){
                  saveProjectToDB(safe, cat, emptyData).then(()=> loadProjectFromDB(safe)).then(()=>{
                    // 导入后直接打开这个项目（主界面选中并刷新）
                    const pn = safe;
                    if(typeof refreshProjectSelectors==='function') refreshProjectSelectors();
                    const sp = document.getElementById('projectSelector1'); if(sp) sp.value = pn;
                    doImport(pn, type);
                  }).catch(e=> recToast('创建项目失败：' + (e&&e.message||e)));
                } else { doImport(safe, type); }
              }
            });
            return;
          }
          const idx = parseInt(pval,10);
          if(isNaN(idx)||idx<0||idx>=existing.length){ recToast('请选择一个项目'); return; }
          close();
          // 清掉当前项目脏标记，避免 requestSwitchProject 弹「未保存修改」框打断导入
          if(typeof window.__tfjlProjectDirty !== 'undefined') window.__tfjlProjectDirty = false;
          const targetName = (existing[idx] && existing[idx].name) ? existing[idx].name : null;
          if(typeof requestSwitchProject==='function' && targetName){
            requestSwitchProject(targetName);
            setTimeout(()=>{
              doImport(targetName, type);
              // 导入完成后确保主界面打开的是目标项目
              if(typeof refreshProjectSelectors==='function') refreshProjectSelectors();
              const sp = document.getElementById('projectSelector1'); if(sp && targetName) sp.value = targetName;
            }, 500); // 切换是异步，稍后再写入并打开
          } else { doImport(targetName, type); }
        };
        // 手牌位置按钮高亮切换
        box.querySelectorAll('button[data-type]').forEach(b=>{
          b.onclick = ()=>{
            box.querySelectorAll('button[data-type]').forEach(x=>{ x.classList.remove('sel'); x.style.outline='none'; });
            b.classList.add('sel'); b.style.outline='3px solid #ffd700';
          };
        });
      };
      openPicker();
    };
    // 常驻“启动识别引擎”按钮：关掉 Umi-OCR 后随时重新打开（显示窗口，用户可见）
    $('recLaunch').onclick = async ()=>{
      const st = $('recStatus');
      const tip = $('recUmiTip');
      if(!isTauri()){ alert('仅桌面版 App 支持本地 OCR，请用桌面版'); return; }
      st.textContent = '正在检查 Umi-OCR 状态…';
      if(await checkUmiOcrAvailable() === true){
        // 已运行：尝试唤出窗口（无害），并给出明确反馈（不再静默 return 让人以为没反应）
        const p = await getStoredUmiPath();
        if(p){ try{ await tauriInvoke('start_umi_ocr', { exePath: p, hidden: false }); }catch(e){} }
        st.textContent = '✅ Umi-OCR 已在运行（已尝试唤出窗口）';
        return;
      }
      let p = await getStoredUmiPath();
      if(!p){
        st.textContent = '未记录路径，正在自动查找…';
        const f = await findUmiOcr(tip);
        p = f || await getStoredUmiPath();
      }
      if(!p){ alert('未找到本机 Umi-OCR，请点「选择 Umi-OCR.exe」或「一键下载安装」'); return; }
      st.textContent = '正在启动 Umi-OCR（显示窗口）…';
      const tryStart = async (exe)=>{
        await ensureUmiTrayHidden(); // 先确保托盘图标隐藏
        await tauriInvoke('start_umi_ocr', { exePath: exe, hidden: false });
        for(let i=0;i<25;i++){ await sleep(800); if(await checkUmiOcrAvailable() === true) return true; }
        return false;
      };
      try{
        let ok = await tryStart(p);
        if(!ok){
          // 启动失败（多半路径失效）→ 重新查找后重试一次
          const f = await findUmiOcr(tip);
          const p2 = f || await getStoredUmiPath();
          if(p2 && p2 !== p) ok = await tryStart(p2);
        }
        st.textContent = ok ? '✅ Umi-OCR 已启动（窗口已显示）' : '⚠️ 启动超时，请手动打开 Umi-OCR';
      }catch(e){ st.textContent = '启动失败: ' + (e&&e.message||e); }
    };
    // 提示区“下载 / 自动查找 / 一键下载安装”链接委托
    const recTipEl = $('recUmiTip');
    if(recTipEl) recTipEl.addEventListener('click', (e)=>{
      const dl = e.target.closest && e.target.closest('a[data-act="dl"]');
      if(dl){ e.preventDefault(); openUmiDownload(); return; }
      const find = e.target.closest && e.target.closest('a[data-act="find"]');
      if(find){ e.preventDefault(); findAndSetUmi(recTipEl); return; }
      const install = e.target.closest && e.target.closest('a[data-act="install"]');
      if(install){ e.preventDefault(); downloadAndInstallUmi(recTipEl); return; }
      const cfg = e.target.closest && e.target.closest('a[data-act="cfgumi"]');
      if(cfg){ e.preventDefault(); cfgUmiHandler(recTipEl); return; }
    });
    // 工具栏“🔍 自动查找”按钮：扫描本机常见位置并自动设置
    const recFindBtn = $('recFind');
    if(recFindBtn) recFindBtn.onclick = ()=> findAndSetUmi($('recUmiTip'));
    // 工具栏“⬇ 下载安装”按钮：一键下载到咱们目录并配置
    const recInstallBtn = $('recInstall');
    if(recInstallBtn) recInstallBtn.onclick = ()=> downloadAndInstallUmi($('recUmiTip'));
  }

  function openModal(){
    const o=$('recognizeOverlay'); if(o) o.style.display='flex';
    // 结果区还没内容时，始终显示使用说明（很多人不会用）
    const tb=$('recBody'), intro=$('recIntro');
    if(intro && (!tb || !tb.children.length)) intro.style.display='block';
    initUmiOnOpen();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
