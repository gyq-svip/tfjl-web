
// ==================== 联盟子页日志转发（Tauri 无法 F12，转发到首页浮窗"控制台日志"） ====================
(function forwardIframeConsole(){
  // 父页 index.html 已把全部 console 捕获进 window.__consoleLogs，并渲染到浮窗
  // 子页是独立 document，自己的 console 不会进父页浮窗 → 这里把子页日志也转发过去，保证"所有操作日志都可见"
  const tag = '[联盟]';
  function pushToParent(level, args){
    try{
      if(window.parent && window.parent !== window && typeof window.parent.__consoleLogs !== 'undefined'){
        const msg = Array.from(args).map(a => {
          if(a instanceof Error) return a.stack || a.message;
          if(typeof a === 'object') try { return JSON.stringify(a).slice(0, 300); } catch(e){ return String(a); }
          return String(a);
        }).join(' ');
        window.parent.__consoleLogs.push({ time: new Date().toTimeString().slice(0,8), level, msg: tag + ' ' + msg });
        if(typeof window.parent.refreshFloatConsole === 'function') window.parent.refreshFloatConsole();
      }
    }catch(e){ /* 转发失败不阻断业务 */ }
  }
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  console.log = (...a) => { pushToParent('log', a); orig.log.apply(console, a); };
  console.warn = (...a) => { pushToParent('warn', a); orig.warn.apply(console, a); };
  console.error = (...a) => { pushToParent('error', a); orig.error.apply(console, a); };
  console.info = (...a) => { pushToParent('info', a); orig.info.apply(console, a); };
})();

// DB 必须在父页（index.html 加载 gh-gist.js 后挂到父 window）拿，子页自己的 window.AllianceDB 永远是 undefined
// 这是 v260801-74 后联盟"注册/登录点了完全没反应"的真正根因（子页拿不到父页全局）
const DB = (window.parent && window.parent.AllianceDB) ? window.parent.AllianceDB
          : (window.AllianceDB || null);
if(!DB){ console.error('[联盟][致命] window.parent.AllianceDB 不存在！父页 gh-gist.js 可能未加载或抛错。请刷新首页后重试。'); }
const SKEY = 'TFJL_AllianceSession';
let session = null;
let state = { date: todayStr(), rows: [], shot: '' };

function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function $(id){ return document.getElementById(id); }
function setMsg(id, txt, cls){ const e=$(id); e.textContent=txt||''; e.className='msg'+(cls?(' '+cls):''); }

function switchTab(t){
  $('tabLogin').classList.toggle('active', t==='login');
  $('tabReg').classList.toggle('active', t==='reg');
  $('loginBox').style.display = t==='login'?'block':'none';
  $('regBox').style.display = t==='reg'?'block':'none';
}

function doLogout(){
  localStorage.removeItem(SKEY);
  session = null;
  location.reload();
}

// ---------- 关闭 / 取消 ----------
function closeAuth(){
  console.log('[联盟][关闭] closeAuth 被调用');
  try{ if(window.parent && typeof window.parent.closeSubpage==='function'){ window.parent.closeSubpage(); return; } }catch(e){ console.error('[联盟][关闭] 调父页 closeSubpage 失败', e); }
  try{ if(window.parent && window.parent!==window && window.parent.location){ window.parent.location.href='index.html'; return; } }catch(e){}
  try{ history.length>1 ? history.back() : ($('authOverlay').style.display='none'); }catch(e){}
}

// ---------- 登录 / 注册 ----------
// 把联盟报错同时打到控制台([联盟]前缀，会被转发到首页浮窗) 与页面步骤区，确保一定可见
function allianceErr(where, e){
  const detail = (e && (e.stack || e.message)) || e;
  console.error('[联盟]['+where+']', detail);
  // 直接写进页面步骤区，浮窗被吞时也能在联盟页看到
  const stepEl = document.getElementById('regStep');
  if (stepEl) {
    stepEl.style.color = '#ff6b6b';
    stepEl.textContent = '❌ 出错['+where+']: ' + ((e && e.message) || detail);
  }
}
// 打印当前 token 状态与总表 gist id（定位"写总表失败"的关键线索）
function allianceDebugEnv(){
  let tk = '';
  try { tk = (typeof window.parent.getGistToken==='function') ? window.parent.getGistToken() : ''; } catch(e){}
  const masked = tk ? (tk.slice(0,4) + '…' + tk.slice(-4) + ' (len=' + tk.length + ')') : '(空/未配置)';
  console.log('[联盟][环境] token=', masked, '| 总表GIST_ID=', window.TFJL_MASTER_GIST_ID || '(未设置)');
  return { has: !!tk, masked };
}
// 一键诊断：当前 token 对共享总表 gist 是否【可读+可写】
async function allianceDiag(){
  const out = document.getElementById('regStep');
  const btn = document.getElementById('diagBtn');
  if(btn){ btn.disabled=true; btn.textContent='诊断中…'; }
  const tk = (typeof window.parent.getGistToken==='function') ? window.parent.getGistToken() : '';
  const MASTER = window.TFJL_MASTER_GIST_ID;
  if(!tk){ if(out){ out.style.color='#ffa500'; out.textContent='⚠️ 未检测到 token，请先配置 GitHub token'; } if(btn){btn.disabled=false;btn.textContent='🔍 诊断：我的 token 能否读写总表';} return; }
  if(!MASTER){ if(out){ out.style.color='#ffa500'; out.textContent='⚠️ 总表 GIST_ID 未配置'; } if(btn){btn.disabled=false;btn.textContent='🔍 诊断：我的 token 能否读写总表';} return; }
  if(out){ out.style.color='#ffd700'; out.textContent='🔍 正在诊断总表读写权限…'; }
  const H = { 'Accept':'application/vnd.github.v3+json', 'Authorization':'token '+tk };
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 10000);
  try{
    const r = await fetch('https://api.github.com/gists/'+MASTER, { headers: H, signal: ctrl.signal });
    const scope = r.headers.get('X-OAuth-Scopes') || '(无 scope 头)';
    console.log('[联盟][诊断] 读总表状态='+r.status, '| token scope='+scope);
    if(!r.ok){
      if(out){ out.style.color='#ff6b6b'; out.textContent='❌ 总表不可读(状态='+r.status+')：token 无法访问该 gist（可能总表不存在或 token 无效/网络不通）'; }
      return;
    }
    // 试写总表（写个临时字段再删掉）
    const p = await fetch('https://api.github.com/gists/'+MASTER, {
      method:'PATCH', headers: Object.assign({ 'Content-Type':'application/json' }, H), signal: ctrl.signal,
      body: JSON.stringify({ files: { '__write_test__': { content: 'diag_'+Date.now() } } })
    });
    if(p.ok){
      await fetch('https://api.github.com/gists/'+MASTER, {
        method:'PATCH', headers: Object.assign({ 'Content-Type':'application/json' }, H), signal: ctrl.signal,
        body: JSON.stringify({ files: { '__write_test__': null } })
      });
      if(out){ out.style.color='#4ade80'; out.textContent='✅ 诊断通过：你的 token 可【读+写】总表 gist，注册应能成功'; }
      console.log('[联盟][诊断] 可写总表 ✓');
    }else{
      if(out){ out.style.color='#ff6b6b'; out.textContent='❌ 你的 token 能读总表但【不能写】(PATCH 状态='+p.status+')。原因：总表 gist 属于开发者账户，你自己的 token 无写权限 → 注册会因写总表失败而报错，但联盟 gist 已建在你账户下。'; }
      console.error('[联盟][诊断] 不可写总表，PATCH 状态='+p.status);
    }
  }catch(e){
    const msg = (e && e.name==='AbortError') ? '❌ 诊断超时(10s)：请检查网络/代理能否访问 api.github.com' : ('❌ 诊断异常: '+((e&&e.message)||e));
    if(out){ out.style.color='#ff6b6b'; out.textContent=msg; }
    console.error('[联盟][诊断] 异常', e);
  }finally{
    clearTimeout(timer);
    if(btn){ btn.disabled=false; btn.textContent='🔍 诊断：我的 token 能否读写总表'; }
  }
}

async function onLogin(){
  const btn=$('loginBtn');
  if(btn){ btn.disabled=true; btn.textContent='处理中…'; }
  console.log('[联盟][onLogin] 函数已执行');   // 最前置：点按钮后若此日志都没有，说明脚本未加载(缓存)
  const u=$('loginUser').value.trim(), p=$('loginPwd').value;
  if(!u||!p){ setMsg('loginMsg','请填写账号和密码','err'); if(btn){btn.disabled=false;btn.textContent='登录';} return; }
  setMsg('loginMsg','正在查询联盟总表…');
  console.log('[联盟] onLogin 开始:', { u, hasToken: !!(typeof window.getGistToken==='function' && window.getGistToken()) });
  allianceDebugEnv();
  try{
    session = await DB.loginAccount(u,p);
    localStorage.setItem(SKEY, JSON.stringify(session));
    setMsg('loginMsg','登录成功 ✓');
    enterMain();
  }catch(e){ allianceErr('login', e); setMsg('loginMsg', (e&&e.message)||'登录失败','err'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='登录'; } }
}

async function onRegister(){
  const btn=$('regBtn');
  if(btn){ btn.disabled=true; btn.textContent='处理中…'; }
  console.log('[联盟][onRegister] 函数已执行');  // 最前置：点按钮后若此日志都没有，说明脚本未加载(缓存)
  const u=$('regUser').value.trim(), p=$('regPwd').value, p2=$('regPwd2').value;
  const alId=$('regAlId').value.trim(), alName=$('regAlName').value.trim();
  if(!u||!p||!alId){ setMsg('regMsg','账号/密码/联盟号必填','err'); if(btn){btn.disabled=false;btn.textContent='注册并绑定联盟';} return; }
  if(p.length<4){ setMsg('regMsg','密码至少4位','err'); if(btn){btn.disabled=false;btn.textContent='注册并绑定联盟';} return; }
  if(p!==p2){ setMsg('regMsg','两次密码不一致','err'); if(btn){btn.disabled=false;btn.textContent='注册并绑定联盟';} return; }
  setMsg('regMsg',''); setMsg('regStep','① 正在查询联盟总表（是否已存在该联盟号）…');
  console.log('[联盟] onRegister 开始:', { u, alId, alName, hasToken: !!(typeof window.getGistToken==='function' && window.getGistToken()) });
  allianceDebugEnv();
  try{
    const al = await DB.registerAccount(u,p,alId,alName, (s)=>{
      if(s==='creating') setMsg('regStep','② 联盟号不存在 → 正在新建联盟战绩库 Gist…');
    });
    setMsg('regStep','③ 已写入联盟总表 ✓');
    session = { username:u, allianceId:alId, allianceName:al.name||alName, gistId:al.gistId };
    localStorage.setItem(SKEY, JSON.stringify(session));
    setMsg('regMsg','注册成功，战绩库已自动创建并加入联盟总表 ✓','ok');
    enterMain();
  }catch(e){ allianceErr('register', e); setMsg('regMsg', (e&&e.message)||'注册失败','err'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='注册并绑定联盟'; } }
}

// ---------- 主界面 ----------
function enterMain(){
  $('authOverlay').style.display='none';
  $('mainCard').style.display='block';
  $('logoutBtn').style.display='inline-block';
  $('iAlName').textContent = session.allianceName||'-';
  $('iAlId').textContent = session.allianceId||'-';
  $('iUser').textContent = session.username||'-';
  $('datePick').value = state.date;
  if(!session.gistId){ setMsg('loadMsg','该联盟尚未创建 Gist（首次保存时会自动创建）。','warn'); }
  renderHistory();
  onLoadDate();
}

function addRow(rank,name,cups,streak){
  const tb=$('recBody');
  const tr=document.createElement('tr');
  tr.innerHTML = `<td><input class="c-rank" type="number" min="1" value="${rank||''}" placeholder="#"></td>`+
    `<td><input class="c-name" value="${esc(name||'')}" placeholder="人名"></td>`+
    `<td><input class="c-cups" type="number" min="0" value="${cups!=null?cups:''}" placeholder="奖杯"></td>`+
    `<td><input class="c-streak" type="number" min="0" value="${streak!=null?streak:''}" placeholder="连胜"></td>`+
    `<td><span class="del" onclick="this.parentNode.parentNode.remove()">✕</span></td>`;
  tb.appendChild(tr);
}
function readRows(){
  return [...$('recBody').querySelectorAll('tr')].map(tr=>{
    const g=s=>tr.querySelector(s).value;
    return {
      rank: Number(g('.c-rank'))||0,
      name: g('.c-name').trim(),
      cups: Number(g('.c-cups'))||0,
      streak: Number(g('.c-streak'))||0
    };
  }).filter(r=>r.name);
}

async function onLoadDate(){
  state.date = $('datePick').value || todayStr();
  $('datePick').value = state.date;
  if(!session.gistId){ setMsg('loadMsg','联盟 Gist 未就绪，先用本地/新建。','warn'); }
  let data=null;
  if(session.gistId){ try{ data = await DB.loadDateRecords(session.gistId, state.date); }catch(e){} }
  if(!data){ data = DB.cacheGet(session.gistId, state.date); if(data) setMsg('loadMsg','已载入本地缓存（联网后可上传/刷新）','ok'); }
  $('recBody').innerHTML='';
  if(data && data.records && data.records.length){
    data.records.forEach(r=>addRow(r.rank, r.name, r.cups, r.streak));
    if(data.screenshot){ state.shot=data.screenshot; showShot(data.screenshot); }
    setMsg('loadMsg', (data.updatedBy?('上次由 '+data.updatedBy+' 更新 · ':'')+new Date(data.updatedAt||Date.now()).toLocaleString()), 'ok');
  } else {
    addRow();
    setMsg('loadMsg','该日期暂无记录，新增后保存即可。','');
  }
}

function onShotChange(e){
  const f=e.target.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height,max=800;
      if(w>max){ h=Math.round(h*max/w); w=max; }
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      const url=cv.toDataURL('image/jpeg',0.7);
      state.shot=url; showShot(url);
    };
    img.src=rd.result;
  };
  rd.readAsDataURL(f);
}
function showShot(url){ const i=$('shotImg'); i.src=url; i.style.display='block'; $('shotHint').style.display='none'; }

async function onSave(){
  if(!session.gistId){ setMsg('saveMsg','联盟 Gist 未就绪，无法上传（仍可本地缓存）。','warn'); }
  const rows=readRows();
  if(!rows.length){ setMsg('saveMsg','请至少填写一行（含人名）','err'); return; }
  const data={ date:state.date, updatedAt:Date.now(), updatedBy:session.username, screenshot:state.shot, records:rows };
  DB.cacheSet(session.gistId, state.date, data); // 本地缓存（离线可用）
  if(session.gistId){
    try{
      await DB.saveDateRecords(session.gistId, state.date, data);
      setMsg('saveMsg','已保存并上传 Gist ✓','ok');
    }catch(e){ setMsg('saveMsg','本地已存，Gist 上传失败：'+(e.message||e),'warn'); }
  }
  renderHistory();
}

async function renderHistory(){
  const box=$('histBox'); box.innerHTML='';
  let dates=[];
  if(session.gistId){ try{ dates = await DB.listAllianceDates(session.gistId); }catch(e){} }
  const cached = session.gistId ? DB.cacheDates(session.gistId) : [];
  const all=[...new Set([...dates, ...cached])].sort();
  if(!all.length){ box.innerHTML='<span class="hint">暂无历史</span>'; return; }
  all.forEach(d=>{
    const el=document.createElement('div');
    el.className='d'+(cached.includes(d)?' cached':'');
    el.textContent=d;
    el.onclick=()=>{ $('datePick').value=d; onLoadDate(); window.scrollTo({top:document.getElementById('tblBox').offsetTop-20,behavior:'smooth'}); };
    box.appendChild(el);
  });
}

// ---------- 启动 ----------
(function init(){
  // 同步状态横幅：Token 由部署自动注入（与首页同源/同 iframe），无 token 则醒目告警
  try{
    const tk = (typeof window.parent.getGistToken==='function') ? window.parent.getGistToken() : '';
    const banner = $('tokenBanner');
    if(banner){
      if(tk && tk.length>10 && tk!=='YOUR_GITHUB_TOKEN_HERE'){
        banner.textContent='✅ GitHub 同步已自动启用（Token 由部署注入），注册即自动建库。';
        banner.className='msg ok';
      } else {
        banner.textContent='⚠️ 未检测到同步 Token：请通过首页「联盟个人战绩统计」入口打开本页（勿直接双击文件）。无 Token 时无法联网建库，按钮将不可用。';
        banner.className='msg err';
        ['loginBtn','regBtn'].forEach(id=>{ const b=$(id); if(b) b.disabled=true; });
      }
    }
  }catch(e){}
  try{ const s=localStorage.getItem(SKEY); if(s) session=JSON.parse(s); }catch(e){}
  if(session && session.gistId){
    enterMain();
  } else {
    $('authOverlay').style.display='flex';
  }
})();
