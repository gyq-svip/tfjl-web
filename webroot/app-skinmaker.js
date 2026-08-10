
  (function(){
    var smImg=null, smScale=1, smOffX=0, smOffY=0, smMargin=6, smRarity='gold';
    var SM_W=206, SM_H=200, SM_D=2;
    var SM_RARITY={
      gold:['#ffd86b','#c8862a'],
      purple:['#c79bff','#6a2db0'],
      blue:['#9bd0ff','#2d6db0'],
      green:['#aef0b0','#2d9e3a']
    };
    var smInited=false;
    function smStatus(msg,isErr){ var el=document.getElementById('smStatus'); if(!el) return; el.textContent=msg; el.style.color=isErr?'#ff6b6b':'rgba(255,255,255,0.7)'; }
    async function smVerifyOnline(){
      var el=document.getElementById('smVerifyStatus'); var inp=document.getElementById('smVerifyHero');
      var hero=(inp?inp.value:'').trim();
      if(el){ el.style.color='rgba(255,255,255,0.7)'; el.textContent='查询中…'; }
      var ctrl=new AbortController(); var timer=setTimeout(function(){ ctrl.abort(); }, 12000);
      try{
        var url='https://gyq-svip.github.io/tfjl-web/skins/registry.json?_='+Date.now();
        var resp=await fetch(url,{cache:'no-store',mode:'cors',signal:ctrl.signal});
        clearTimeout(timer);
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        var data=await resp.json();
        var heroes=(data&&data.heroes)?Object.keys(data.heroes):[];
        if(hero){
          if(heroes.indexOf(hero)>=0){
            if(el){ el.style.color='#4ade80'; el.textContent='✅ 线上已登记英雄「'+hero+'」——你切的皮已成功上线。\n线上共 '+heroes.length+' 个英雄皮肤。'; }
          } else {
            if(el){ el.style.color='#ffd54f'; el.textContent='⏳ 线上未查到「'+hero+'」。可能：①还没推送 / ②Pages 部署延迟（等约 1 分钟再查）/ ③英雄名不一致。\n线上目前共 '+heroes.length+' 个：'+(heroes.join('、')||'(空)'); }
          }
        } else {
          if(el){ el.style.color='#4ade80'; el.textContent='✅ 线上已登记 '+heroes.length+' 个英雄皮肤：\n'+(heroes.join('、')||'(空)'); }
        }
      }catch(e){
        clearTimeout(timer);
        if(el){ el.style.color='#ff6b6b'; el.textContent='✗ 查询失败：'+((e&&e.name==='AbortError')?'超时（12s 无响应，可能网络不通/被墙）':e.message)+'（可手动浏览器打开 https://gyq-svip.github.io/tfjl-web/skins/registry.json 核对）'; }
      }
    }
    function smRender(ctx,scale){
      var W=SM_W*scale, H=SM_H*scale;
      ctx.clearRect(0,0,W,H);
      var col=SM_RARITY[smRarity];
      var g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,col[0]); g.addColorStop(1,col[1]);
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      if(!smImg) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
      var innerW=SM_W-2*smMargin, innerH=SM_H-2*smMargin;
      var base=Math.max(innerW/smImg.width, innerH/smImg.height);
      var dw=smImg.width*base*smScale, dh=smImg.height*base*smScale;
      var cx=SM_W/2+smOffX, cy=SM_H/2+smOffY;
      var dx=cx-dw/2, dy=cy-dh/2;
      ctx.drawImage(smImg, dx*scale, dy*scale, dw*scale, dh*scale);
      ctx.restore();
      ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=Math.max(1,scale);
      ctx.strokeRect(0.5,0.5,W-1,H-1);
    }
    function smRenderAll(){
      var cv=document.getElementById('skinMakerCanvas'); if(cv) smRender(cv.getContext('2d'), SM_D);
      var pv=document.getElementById('skinMakerPreview'); if(pv) smRender(pv.getContext('2d'), 1);
      var h=document.getElementById('smHero'), l=document.getElementById('smLabel'), np=document.getElementById('smNamePreview');
      if(h&&l&&np) np.textContent=((l.value.trim()&&h.value.trim())?(l.value.trim()+'·'+h.value.trim()):'皮肤标签·英雄名')+'.png';
    }
    function smSetRarity(r){
      smRarity=r;
      var btns=document.querySelectorAll('[data-sm-rarity]');
      for(var i=0;i<btns.length;i++){ btns[i].style.outline=(btns[i].getAttribute('data-sm-rarity')===r)?'3px solid #ffd700':'none'; }
      smRenderAll();
    }
    function smLoadFile(e){
      var f=e.target.files&&e.target.files[0]; if(!f) return;
      var r=new FileReader();
      r.onload=function(ev){
        var img=new Image();
        img.onload=function(){ smImg=img; smScale=1; smOffX=0; smOffY=0; var z=document.getElementById('smZoom'); if(z){z.value=1; document.getElementById('smZoomVal').textContent='1.00';} smRenderAll(); };
        img.src=ev.target.result;
      };
      r.readAsDataURL(f);
    }
    function smWheel(e){
      if(!smImg) return;
      var rect=document.getElementById('skinMakerCanvas').getBoundingClientRect();
      var cardX=(e.clientX-rect.left)/SM_D, cardY=(e.clientY-rect.top)/SM_D;
      var innerW=SM_W-2*smMargin, innerH=SM_H-2*smMargin;
      var base=Math.max(innerW/smImg.width, innerH/smImg.height);
      var dw=smImg.width*base*smScale, dh=smImg.height*base*smScale;
      var cx=SM_W/2+smOffX, cy=SM_H/2+smOffY;
      var dx=cx-dw/2, dy=cy-dh/2;
      var localX=(cardX-dx)/dw*smImg.width, localY=(cardY-dy)/dh*smImg.height;
      var factor=e.deltaY<0?1.12:0.89;
      var ns=Math.min(6,Math.max(0.2,smScale*factor));
      var ndw=smImg.width*base*ns, ndh=smImg.height*base*ns;
      var ndx=cardX-localX/smImg.width*ndw, ndy=cardY-localY/smImg.height*ndh;
      smOffX=(ndx+ndw/2)-SM_W/2;
      smOffY=(ndy+ndh/2)-SM_H/2;
      smScale=ns;
      var z=document.getElementById('smZoom'); if(z){ z.value=ns; document.getElementById('smZoomVal').textContent=ns.toFixed(2); }
      smRenderAll();
    }
    function smExportDataURL(){
      var c=document.createElement('canvas'); c.width=SM_W; c.height=SM_H;
      smRender(c.getContext('2d'),1);
      return c.toDataURL('image/png');
    }
    function smErrMsg(err){ return (err&&(err.message||(err.toString&&err.toString())||JSON.stringify(err)))||String(err)||'未知错误'; }
    function smGetInvoke(){
      if(window.__TAURI_INTERNALS__&&typeof window.__TAURI_INTERNALS__.invoke==='function') return window.__TAURI_INTERNALS__.invoke;
      if(window.__TAURI__&&window.__TAURI__.core&&typeof window.__TAURI__.core.invoke==='function') return window.__TAURI__.core.invoke;
      if(window.__TAURI__&&typeof window.__TAURI__.invoke==='function') return window.__TAURI__.invoke;
      return null;
    }
    function smInvoke(cmd,args){
      var fn=smGetInvoke();
      if(fn) return fn(cmd,args);
      return Promise.reject(new Error('NOT_TAURI_ENV'));
    }
    async function smDownload(){
      if(!smImg){ smStatus('请先选择图片',true); return; }
      var hero=document.getElementById('smHero').value.trim();
      var label=document.getElementById('smLabel').value.trim();
      // 必填校验：缺任一项会让路径退化成 skins\skin.png 这种野文件，且会被一键推送带上线
      if(!hero||!label){ smStatus('请先填写「英雄名」和「皮肤标签」再下载（否则会生成无法识别的 skin.png 垃圾文件）',true); return; }
      var name=label+'·'+hero;
      var fn=smGetInvoke();
      if(fn){
        var base=document.getElementById('smBasePath').value.trim().replace(/[\\/]$/,'');
        var pngPath=base+'\\'+hero+'\\'+name+'.png';
        smStatus('下载中（写入 '+pngPath+'）…');
        fn('write_binary_file',{filePath:pngPath, contentBase64:smExportDataURL().split(',')[1]})
          .then(function(){ smStatus('✅ 已写入 '+pngPath+'（仅图片，未登记 registry；入库请用"保存并登记"）'); })
          .catch(function(err){ smStatus('写入失败：'+smErrMsg(err)+'（可改路径或检查权限）',true); });
        return;
      }
      if(window.showSaveFilePicker){
        try{
          var blob=await (await fetch(smExportDataURL())).blob();
          var handle=await window.showSaveFilePicker({suggestedName:name+'.png', types:[{description:'PNG 图片', accept:{'image/png':['.png']}}]});
          var w=await handle.createWritable(); await w.write(blob); await w.close();
          smStatus('✅ 已保存到您选择的位置（'+name+'.png）。请存到 D:\\tfjl-web\\skins\\'+hero+'\\ 再让我入库', true);
          return;
        }catch(e){ if(e&&e.name==='AbortError'){ smStatus('已取消保存'); return; } }
      }
      var a=document.createElement('a'); a.href=smExportDataURL(); a.download=name+'.png'; a.click();
      smStatus('已下载到浏览器默认下载目录（'+name+'.png）。请手动移到 D:\\tfjl-web\\skins\\'+hero+'\\ ，再让我入库', true);
    }
    // 复制「分享图」（带网址水印）到剪贴板，与皮肤素材下载分离，避免污染游戏内素材
    function smSaveShareImage(){
      if(!smImg){ smStatus('请先选择图片',true); return; }
      var c=document.createElement('canvas'); c.width=SM_W; c.height=SM_H;
      var ctx=c.getContext('2d'); smRender(ctx,1);
      if(window.stampWatermark) window.stampWatermark(ctx, SM_W, SM_H);
      c.toBlob(function(blob){
        if(blob && navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined'){
          try {
            navigator.clipboard.write([new ClipboardItem({'image/png': blob})]).then(function(){
              smStatus('已复制带网址水印的分享图到剪贴板（Ctrl+V 可直接粘贴），皮肤素材未受影响', true);
            }).catch(function(){ fallbackShareDownload(c); });
          } catch(e){ fallbackShareDownload(c); }
        } else { fallbackShareDownload(c); }
      }, 'image/png');
    }
    function fallbackShareDownload(c){
      var a=document.createElement('a'); a.href=c.toDataURL('image/png'); a.download='皮肤分享_'+Date.now()+'.png'; a.click();
      smStatus('已保存带网址水印的分享图到下载目录（剪贴板不可用，已改为下载）', true);
    }
    // 仅补属性模式：不选图，只给【已存在于 registry 的旧皮肤】补写属性到 skin-attributes.json
    function smSaveAttrOnly(hero,label,attrVal,base){
      smStatus('补充属性中…');
      smInvoke('read_text_file_auto',{filePath:base+'\\registry.json'}).catch(function(){ return null; })
        .then(function(regText){
          if(!regText) throw new Error('registry.json 读取失败');
          var reg=JSON.parse(regText);
          var list=(reg.heroes&&reg.heroes[hero])||[];
          if(!list.length) throw new Error('registry 里没有英雄「'+hero+'」，请检查英雄名是否写对');
          var full=label+'·'+hero;
          // 皮肤名两种形态：带标签的「标签·英雄」，或默认皮肤直接叫「英雄」
          var hit=null;
          if(list.some(function(s){return s.name===full;})) hit=full;
          else if(list.some(function(s){return s.name===label;})) hit=label;
          if(!hit) throw new Error('「'+hero+'」下找不到皮肤「'+full+'」。现有皮肤：'+list.map(function(s){return s.name;}).join('、'));
          return hit;
        })
        .then(function(skinName){
          return smInvoke('read_text_file_auto',{filePath:base+'\\skin-attributes.json'}).catch(function(){ return null; })
            .then(function(at){
              var obj=at?JSON.parse(at):{};
              if(!obj[hero]) obj[hero]={};
              obj[hero][skinName]={desc:attrVal};
              var ab=btoa(unescape(encodeURIComponent(JSON.stringify(obj,null,2))));
              return smInvoke('write_binary_file',{filePath:base+'\\skin-attributes.json', contentBase64:ab})
                .then(function(){ smStatus('✅ 已为「'+skinName+'」写入属性（未改图片、未动 registry）\n点「🚀 一键推送」即可上线给所有人'); });
            });
        })
        .catch(function(err){ smStatus('补属性失败：'+smErrMsg(err),true); });
    }
    function smSave(){
      var hero=document.getElementById('smHero').value.trim();
      var label=document.getElementById('smLabel').value.trim();
      if(!hero||!label){ smStatus('请填写英雄名和皮肤标签',true); return; }
      var base=document.getElementById('smBasePath').value.trim().replace(/[\\/]$/,'');
      // 没选图但填了属性 → 走「仅补属性」，用于给以前没写属性的老皮肤补资料
      if(!smImg){
        var a0=document.getElementById('smAttr').value.trim();
        if(!a0){ smStatus('未选择图片。若想给已有皮肤补属性，请填好英雄名+皮肤标签+「皮肤属性」再点保存',true); return; }
        smSaveAttrOnly(hero,label,a0,base);
        return;
      }
      var name=label+'·'+hero, file=name+'.png';
      smStatus('保存中…');
      smInvoke('write_binary_file',{filePath:base+'\\'+hero+'\\'+file, contentBase64:smExportDataURL().split(',')[1]})
        .then(function(){
          return smInvoke('read_text_file_auto',{filePath:base+'\\registry.json'}).catch(function(){ return null; });
        })
        .then(function(regText){
          if(!regText) throw new Error('registry 读取失败');
          var reg=JSON.parse(regText);
          reg.heroes=reg.heroes||{};
          if(!reg.heroes[hero]) reg.heroes[hero]=[];
          if(!reg.heroes[hero].some(function(s){return s.name===name;})){
            reg.heroes[hero].push({name:name, file:file});
            reg.updated=new Date().toISOString();
          }
          var regB64=btoa(unescape(encodeURIComponent(JSON.stringify(reg,null,2))));
          return smInvoke('write_binary_file',{filePath:base+'\\registry.json', contentBase64:regB64});
        })
        .then(function(){
          // 可选：皮肤属性写入云端 skins/skin-attributes.json（随 git_push_skins 一起推送）
          var attrVal=document.getElementById('smAttr').value.trim();
          if(!attrVal) return;
          return smInvoke('read_text_file_auto',{filePath:base+'\\skin-attributes.json'}).catch(function(){ return null; })
            .then(function(at){
              var obj=at?JSON.parse(at):{};
              if(!obj[hero]) obj[hero]={};
              obj[hero][name]={desc:attrVal};
              var ab=btoa(unescape(encodeURIComponent(JSON.stringify(obj,null,2))));
              return smInvoke('write_binary_file',{filePath:base+'\\skin-attributes.json', contentBase64:ab});
            });
        })
        .then(function(){
          var attrVal=document.getElementById('smAttr').value.trim();
          smStatus('✅ 已保存 '+base+'\\'+hero+'\\'+file+' 并登记 registry.json'+(attrVal?' 及皮肤属性':'')+'（告诉我推送即可上线）');
        })
        .catch(function(err){
          smStatus('保存失败：'+smErrMsg(err)+'（若不在桌面App内，可用"下载PNG"拿到图片后交给我）',true);
        });
    }
    function smPush(){
      var fn=smGetInvoke();
      if(!fn){ smStatus('当前环境无法推送：需在桌面App内且已更新到含「一键推送」的版本。可手动让我推送。',true); return; }
      smStatus('推送中…');
      fn('git_push_skins').then(function(res){
        smStatus('✅ 推送完成：\n'+res+'\n刷新 App 即可看到新皮肤。');
      }).catch(function(err){ smStatus('推送失败：'+smErrMsg(err),true); });
    }
    function smInit(){
      if(smInited) return; smInited=true;
      var cv=document.getElementById('skinMakerCanvas');
      if(cv) cv.addEventListener('wheel', function(e){ e.preventDefault(); smWheel(e); }, {passive:false});
      var dragging=false, lx=0, ly=0;
      if(cv){
        cv.addEventListener('mousedown', function(e){ dragging=true; lx=e.clientX; ly=e.clientY; cv.style.cursor='grabbing'; });
        cv.addEventListener('mousemove', function(e){
          if(!dragging) return;
          smOffX+=(e.clientX-lx)/SM_D; smOffY+=(e.clientY-ly)/SM_D; lx=e.clientX; ly=e.clientY; smRenderAll();
        });
        cv.addEventListener('mouseup', function(){ dragging=false; cv.style.cursor='grab'; });
        cv.addEventListener('mouseleave', function(){ dragging=false; cv.style.cursor='grab'; });
      }
      var fi=document.getElementById('skinMakerFile'); if(fi) fi.addEventListener('change', smLoadFile);
      var btns=document.querySelectorAll('[data-sm-rarity]');
      for(var i=0;i<btns.length;i++){ btns[i].addEventListener('click', (function(b){ return function(){ smSetRarity(b.getAttribute('data-sm-rarity')); }; })(btns[i])); }
      var z=document.getElementById('smZoom'); if(z) z.addEventListener('input', function(e){ smScale=parseFloat(e.target.value); document.getElementById('smZoomVal').textContent=smScale.toFixed(2); smRenderAll(); });
      var m=document.getElementById('smMargin'); if(m) m.addEventListener('input', function(e){ smMargin=parseInt(e.target.value); document.getElementById('smMarginVal').textContent=smMargin; smRenderAll(); });
      var rs=document.getElementById('smReset'); if(rs) rs.addEventListener('click', function(){ smScale=1; smOffX=0; smOffY=0; if(z){z.value=1; document.getElementById('smZoomVal').textContent='1.00';} smRenderAll(); });
      var dl=document.getElementById('smDownload'); if(dl) dl.addEventListener('click', smDownload);
      var sv=document.getElementById('smSave'); if(sv) sv.addEventListener('click', smSave);
      var pb=document.getElementById('smPush'); if(pb) pb.addEventListener('click', function(){ smPush(); });
      var h=document.getElementById('smHero'), l=document.getElementById('smLabel');
      if(h) h.addEventListener('input', smRenderAll);
      if(l) l.addEventListener('input', smRenderAll);
      smSetRarity('gold');
    }
    // 删除已入库皮肤：初始化英雄下拉（含 融合XX）+ 联动皮肤下拉
    async function smInitDelSkinUI(){
      var sel=document.getElementById('smDelHero'); if(!sel) return;
      var keys=new Set();
      if(window.skinRegistry) Object.keys(window.skinRegistry).forEach(function(k){ keys.add(k); });
      if(window.cloudCards) Object.keys(window.cloudCards).forEach(function(k){ keys.add(k); });
      // 补全：仓库 skins/registry.json（切皮/删皮的权威源，App 运行时可能尚未同步到 skinRegistry）
      try{
        var local=await _cgmReadRepoFile('skins/registry.json');
        if(local){ var reg=JSON.parse(local); if(reg&&reg.heroes) Object.keys(reg.heroes).forEach(function(k){ keys.add(k); }); }
      }catch(e){}
      sel.innerHTML='<option value="">选择英雄…</option>';
      Array.from(keys).sort().forEach(function(k){ var o=document.createElement('option'); o.value=k; o.textContent=k; sel.appendChild(o); });
      smRefreshDelSkinList();
    }
    async function smRefreshDelSkinList(){
      var hsel=document.getElementById('smDelHero'); var ssel=document.getElementById('smDelSkin');
      if(!hsel||!ssel) return;
      var hero=hsel.value; ssel.innerHTML='<option value="">选择皮肤…</option>';
      if(!hero) return;
      var list=[];
      // 优先读仓库 skins/registry.json（切皮/删皮的权威源），兜底回退 skinRegistry
      var readErr=null;
      try{
        var local=await _cgmReadRepoFile('skins/registry.json');
        if(local){ var reg=JSON.parse(local); if(reg&&reg.heroes&&reg.heroes[hero]) list=reg.heroes[hero]; }
      }catch(e){ readErr=e; }
      if(!list.length && window.skinRegistry && window.skinRegistry[hero]) list=window.skinRegistry[hero];
      if(!list.length){
        var msg;
        if(readErr){
          msg='（读取仓库失败：'+ (readErr.message||readErr) +'；请在 App 内操作或刷新皮肤库）';
        } else {
          msg='（该英雄暂无可删皮肤）';
        }
        var o=document.createElement('option'); o.value=''; o.textContent=msg; o.disabled=true; o.style.color='#ff9e80'; ssel.appendChild(o); return;
      }
      list.forEach(function(s){ var o=document.createElement('option'); o.value=s.name; o.textContent=s.name; ssel.appendChild(o); });
    }
    async function smDeleteSkin(){
      var hsel=document.getElementById('smDelHero'); var ssel=document.getElementById('smDelSkin'); var status=document.getElementById('smDelStatus');
      var hero=hsel?hsel.value:''; var skin=ssel?ssel.value:'';
      if(!hero||!skin){ if(status){status.style.color='#ff9e80';status.textContent='请先选择英雄和皮肤';} return; }
      if(!confirm('确认删除「'+hero+'」的皮肤「'+skin+'」？\n将从 registry.json 移除该皮肤登记（界面不再显示）。\n磁盘 png 仍保留在 skins/'+hero+'/，如需彻底删除请手动清理对应文件。')) return;
      try{
        var registry=null;
        var local=await _cgmReadRepoFile('skins/registry.json');
        if(local) registry=JSON.parse(local);
        if(!registry||!registry.heroes) registry={version:2,heroes:{}};
        if(!registry.heroes[hero]){ if(status){status.style.color='#ff9e80';status.textContent='该英雄无登记皮肤';} return; }
        registry.heroes[hero]=registry.heroes[hero].filter(function(s){ return s.name!==skin; });
        if(!registry.heroes[hero].length) delete registry.heroes[hero];
        registry.updated=new Date().toISOString();
        await _cgmWriteRepoFile('skins/registry.json', JSON.stringify(registry,null,2));
        if(window.skinRegistry&&window.skinRegistry[hero]){ window.skinRegistry[hero]=window.skinRegistry[hero].filter(function(s){ return s.name!==skin; }); }
        smRefreshDelSkinList();
        // 推送到云端（GitHub + Gitee），让所有人刷新即生效；非 App 环境（纯网页无 Tauri）则提示手动处理
        var fn=smGetInvoke();
        if(fn){
          try{
            await fn('git_push_skins', {});
            if(status){ status.style.color='#4ade80'; status.textContent='✓ 已移除「'+hero+' · '+skin+'」的皮肤登记，并已推送云端（GitHub/Gitee）。\n（磁盘文件 skins/'+hero+'/ 未删，需彻底清理可手动删除对应 png）'; }
          }catch(e2){
            if(status){ status.style.color='#ff9e80'; status.textContent='⚠️ 本地登记已移除，但云端推送失败：'+(e2&&e2.message?e2.message:e2)+'\n请检查网络/代理后重试，或手动 git 推送。'; }
          }
        } else {
          if(status){ status.style.color='#ffd700'; status.textContent='✓ 本地登记已移除（仅网页环境，无法自动推送）。\n请在 App 内执行删除，或手动 git 推送 skins/registry.json。\n（磁盘文件 skins/'+hero+'/ 未删）'; }
        }
      }catch(e){ if(status){status.style.color='#ff9e80';status.textContent='✗ 删除失败：'+e.message;} }
    }
    window.openSkinMaker=function(){
      smInit(); smRenderAll(); smInitDelSkinUI();
      // 皮肤注册表（scanSkins + syncRemoteSkins）是异步加载的，刚打开 Tab 时可能尚未就绪 → 延迟补填删除列表，避免空列表
      setTimeout(function(){ try{ smInitDelSkinUI(); }catch(e){} }, 600);
      setTimeout(function(){ try{ smInitDelSkinUI(); }catch(e){} }, 1600);
      var fn=smGetInvoke();
      smStatus((fn?'✅ 已检测到 Tauri（可直接写 skins 目录）；':'⚠️ 未检测到 Tauri（将走「文件另存」，请手动选 D:\\tfjl-web\\skins\\英雄\\）；')+'选择透明立绘，滚轮缩放、拖拽移动，选好底色后点下载/保存。');
    };
    window.closeSkinMaker=function(){ var m=document.getElementById('cardGroupMgrModal'); if(m) m.style.display='none'; };
    // 🔴 修复：删除/查线上两个子面板用 inline onclick/onchange，函数在本 IIFE 内不可见 → 全部"点了没反应"。
    //    必须挂到 window 上，inline 处理器才能找到（v260805-265 修复）
    window.smRefreshDelSkinList = smRefreshDelSkinList;
    window.smDeleteSkin = smDeleteSkin;
    window.smInitDelSkinUI = smInitDelSkinUI;
    window.smVerifyOnline = smVerifyOnline;
  })();
  