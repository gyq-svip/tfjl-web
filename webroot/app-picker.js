
        // ==================== 通用选择器（首字母 + 关键字搜索，所有"选卡/选英雄/选皮肤"场景复用）====================
        // 汉字→拼音首字母紧凑字典（塔防精灵全部卡名用字，457字全覆盖，由 scripts 生成校验）
        window._hanziPyMap = null;
        window.hanziInitials = function(str) {
            if (!window._hanziPyMap) {
                const _d = "亡w将j傀k光g精j灵l冰b弓g法f骑q鸟n凤f凰h刀d客k刺c剑j后h羿y咕g咬y人r娃w土t圣s地d大d树s天t使s女n妖y王w孤g星x宝b库k射s线x小x丑c炮p野y鹿l工g匠j巫w医y幻h幽y彩c影y恶e匪f魔m悟w空k战z斧f暗a木m松s鼠s死s神s毒d水s沙s皇h海h潜q艇t火h枪q炎y炸z弹d爱a狂k龙l猫m咪m电d石s头t龛k祭j司s绿l船c长z萌m萨s满m葵k虎h蛇s蜘z蛛z谜m云y邪x酋q钟z馗k钢g鬃z铁t闪s阿a翼y雷l霸b领l主z风f飞f机j骨g魂h魇y鱼y鲛j拳q龟g相x融r合h番f僧s李l公g榴l姐j扇s蜈w蚣g左z慈c传c国g玉y玺x葫h芦l狮s令l牌p雪x莲l暴b诞d郎l寒h真z气q陨y陆l五w教j周z瑜y怪g杰j竖s白b育y娅y太t平p乐l仙x华h夫f佗t老l爷y少s林l掌z门m深s异y兽s宋s江j虚x触c须x关g羽y武w创c世s泰t坦t孙s权q无w士s月y财c阀f美m猴h齐q至z尊z戚q秦q氏s清q扬y晶j娘n子z潘p金j任r盈y如r烟y和h伊y玄x刚g冢z侏z儒r峰f塔t日r晷g川c谱p花h师s提t督d官g貂d蝉c秋q香x沈s璧b君j十s三s姨y万w甜t心x七q仪y琳l紫z霞x蟠p桃t千q年n包b婆p疗l甲j柴c进j衡h山s豚t夏x孔k明m灯d铃l铛d二e卢l俊j义y上s知z钱q楼l马m虹h黄h鸿h之z吕l布b萧x一y许x仕s卷j帘l兔t粉f色s南n瓜g节j指z名m谛d听t杨y志z叶y城c潮c汐x刘l备b有y为w青q西x庆q巨j鲨s号h微w型x狐h冲c谢x晓x张z吼h能n尚s方f霜s向x燕y永y恒h黑h旋x奥a特t曼m艾a斯s唐t豪h银y河h招z春c戴d宗z烈l焰y状z元y猎l手s对d穿c肠c冥m奶n藏c诸z葛g亮l鸦y莫m再z嫦c娥e东d不b败b乔q丝s娜n罗l刹c夺d命m书s生s吹c蝎x牛n智z多d吴w用y蓬p帅s镜j缺q嵩s祝z枝z冬d呼h延y灼z讲j菩p祖z隐y身s哪n吒z科k学x家j符f咒z赛s文w常c威w寻x欢h的d伯b典d狱y鬼g荣r徽h还h丹d曹c操g高g俅q豹b绝j盒h甘g宁n梁l宽k田t儿e顺s碧b蓝l岳y珊s脚j鲁l广g帝d角j宫g象x";
                const _m = {};
                for (let _i = 0; _i < _d.length; _i += 2) _m[_d[_i]] = _d[_i + 1];
                window._hanziPyMap = _m;
            }
            let _o = '';
            const _s = (str == null ? '' : String(str));
            for (const _c of _s) { if (window._hanziPyMap[_c]) _o += window._hanziPyMap[_c]; }
            return _o;
        };
        // 通用筛选器：居中浮层 + 搜索框（关键字 / 首字母）+ 列表，点击回调 onPick(value, item)
        function openGenericPicker(opts) {
            opts = opts || {};
            const items = opts.items || [];
            const title = opts.title || '请选择';
            const placeholder = opts.searchPlaceholder || '🔍 输入关键字或首字母';
            const onPick = opts.onPick || function() {};
            const multi = !!opts.multi; // 卡片多选模式
            const wide = !!opts.wide;
            // 多列密度：'2'|'3'|'4'。手牌多选默认 2 列（选多职业卡片变多也不拥挤）；皮肤等单选走自适应
            const cols = opts.columns || (multi ? '4' : 'auto');
            // 浮层宽度：默认 420；手牌多选 4 列用窄框（两行布局不裁切）
            const overlayWidth = opts.overlayWidth || (wide ? 'min(860px,96vw)' : (multi ? 'min(440px,92vw)' : 'min(420px,92vw)'));
            const align = opts.align || 'center'; // center | left | right —— 手牌选择器靠左/靠右弹出
            const floating = !!opts.floating; // 悬浮窗模式：无全屏背景，可拖拽/缩放，多个可并存
            const floatWidth = opts.floatWidth || 'min(300px,82vw)'; // 悬浮窗默认小框
            const noBackdrop = !!opts.noBackdrop;
            // 不同手牌的 picker 给独立 id，避免「点另一个放大镜先点的消失」
            const overlayId = opts.overlayId || ('tfjlGenericPicker_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
            const old = document.getElementById(overlayId);
            if (old && opts.overlayId) old.remove();
            // 职业分类集合（多选 toggle）；有收藏卡则追加「收藏」
            const profSet = new Set();
            let hasFav = false;
            items.forEach(function(it) { if (it.profession) profSet.add(it.profession); if (it.favorite) hasFav = true; });
            const profs = Array.from(profSet);
            const overlay = document.createElement('div');
            overlay.id = overlayId;
            const parent = opts.parent || document.body;
            const box = document.createElement('div');
            if (floating) {
                overlay.style.cssText = 'position:fixed;inset:0;z-index:100015;pointer-events:none;';
                const fLeft = (align === 'right') ? 'auto' : '12px';
                const fRight = (align === 'right') ? '12px' : 'auto';
                box.style.cssText = 'position:fixed;top:88px;left:' + fLeft + ';right:' + fRight + ';width:' + floatWidth + ';height:360px;pointer-events:auto;background:rgba(28,30,40,0.98);border:1px solid rgba(255,215,0,0.4);border-radius:12px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,0.6);display:flex;flex-direction:column;box-sizing:border-box;';
                // 记忆上次位置/大小：恢复时改 left 定位
                const _fkey = (typeof opts.floatKey === 'string' && opts.floatKey) ? opts.floatKey : ('gen_' + (title || ''));
                try {
                    const _sr = JSON.parse(localStorage.getItem('tfjl_floatrect_' + _fkey) || 'null');
                    if (_sr) {
                        if (_sr.left) { box.style.left = _sr.left; box.style.right = 'auto'; }
                        if (_sr.top) box.style.top = _sr.top;
                        if (_sr.width) box.style.width = _sr.width + 'px';
                        if (_sr.height) box.style.height = _sr.height + 'px';
                    }
                } catch (e) {}
                box._saveFloatRect = function() {
                    try {
                        const r = { width: box.offsetWidth, height: box.offsetHeight };
                        if (box.style.left && box.style.left !== 'auto') r.left = box.style.left;
                        if (box.style.top) r.top = box.style.top;
                        localStorage.setItem('tfjl_floatrect_' + _fkey, JSON.stringify(r));
                    } catch (e) {}
                };
            } else if (noBackdrop) {
                overlay.style.cssText = 'display:flex;align-items:stretch;justify-content:center;min-height:0;width:100%;height:100%;';
                box.style.cssText = 'width:100%;height:100%;background:rgba(28,30,40,0.98);border:1px solid rgba(255,215,0,0.4);border-radius:10px;padding:12px;box-shadow:none;display:flex;flex-direction:column;box-sizing:border-box;';
            } else {
                const justifyContent = (align === 'left') ? 'flex-start' : (align === 'right') ? 'flex-end' : 'center';
                const padX = (align === 'left') ? '2vw' : (align === 'right') ? '2vw' : '0';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:100010;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:' + justifyContent + ';padding-left:' + (align === 'left' ? padX : '0') + ';padding-right:' + (align === 'right' ? padX : '0') + ';box-sizing:border-box;';
                box.style.cssText = 'width:' + overlayWidth + ';height:min(72vh,560px);background:rgba(28,30,40,0.98);border:1px solid rgba(255,215,0,0.4);border-radius:12px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,0.6);display:flex;flex-direction:column;';
            }
            overlay.appendChild(box);
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
            const hEl = document.createElement('div');
            hEl.textContent = title;
            hEl.style.cssText = 'font-size:0.95rem;font-weight:600;color:#ffd54f;';
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:1.1rem;cursor:pointer;opacity:0.7;';
            closeBtn.onclick = function() { overlay.remove(); };
            head.appendChild(hEl); head.appendChild(closeBtn);
            box.appendChild(head);
            // 悬浮窗：拖拽（标题栏）+ 缩放（右下角手柄）
            if (floating) {
                head.style.cursor = 'move';
                let drag = null;
                head.addEventListener('mousedown', function(e) {
                    if (e.target === closeBtn) return;
                    drag = { x: e.clientX, y: e.clientY, l: box.offsetLeft, t: box.offsetTop };
                    e.preventDefault();
                });
                document.addEventListener('mousemove', function(e) {
                    if (!drag) return;
                    const nx = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, drag.l + (e.clientX - drag.x)));
                    const ny = Math.max(0, Math.min(window.innerHeight - 40, drag.t + (e.clientY - drag.y)));
                    box.style.left = nx + 'px';
                    box.style.top = ny + 'px';
                    box.style.right = 'auto';
                });
                document.addEventListener('mouseup', function() { drag = null; if (box._saveFloatRect) box._saveFloatRect(); });
                const rz = document.createElement('div');
                rz.title = '拖拽缩放';
                rz.style.cssText = 'position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%,rgba(255,255,255,0.45) 45%,rgba(255,255,255,0.45) 55%,transparent 55%,transparent 70%,rgba(255,255,255,0.45) 70%,rgba(255,255,255,0.45) 80%,transparent 80%);';
                box.appendChild(rz);
                let rsize = null;
                rz.addEventListener('mousedown', function(e) {
                    rsize = { x: e.clientX, y: e.clientY, w: box.offsetWidth, h: box.offsetHeight };
                    e.preventDefault(); e.stopPropagation();
                });
                document.addEventListener('mousemove', function(e) {
                    if (!rsize) return;
                    box.style.width = Math.max(220, rsize.w + (e.clientX - rsize.x)) + 'px';
                    box.style.height = Math.max(160, rsize.h + (e.clientY - rsize.y)) + 'px';
                });
                document.addEventListener('mouseup', function() { rsize = null; if (box._saveFloatRect) box._saveFloatRect(); });
            }
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.placeholder = placeholder;
            inp.style.cssText = 'width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:0.85rem;box-sizing:border-box;margin-bottom:6px;';
            box.appendChild(inp);
            // 多选状态
            let selectedProf = ''; // 职业单选：''=全部, '__fav'=收藏, 其他=职业 key
            const selectedCards = new Set(); // 卡片多选（pickKey 集合）
            // 职业/收藏分类栏（单选 radio 风格：互斥切换；点同一项再点取消）
            let profBar = null;
            if (profs.length > 1 || hasFav) {
                function makeProfBtn(label, val) {
                    const b = document.createElement('button');
                    b.textContent = label;
                    b.dataset.val = val;
                    const on = (selectedProf === val);
                    b.style.cssText = 'padding:3px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.2);background:' + (on ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.06)') + ';color:#fff;font-size:0.72rem;cursor:pointer;' + (on ? 'border-color:rgba(255,215,0,0.5);' : '');
                    b.onclick = function() {
                        selectedProf = (selectedProf === val) ? '' : val;
                        profBar.querySelectorAll('button').forEach(function(x) {
                            const v = x.dataset.val;
                            const active = (selectedProf === v);
                            x.style.background = active ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.06)';
                            x.style.borderColor = active ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.2)';
                        });
                        render(inp.value);
                    };
                    return b;
                }
                profBar = document.createElement('div');
                profBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;';
                profBar.appendChild(makeProfBtn('全部', ''));
                profs.forEach(function(p) { profBar.appendChild(makeProfBtn(window.professionToCn ? window.professionToCn(p) : p, p)); });
                if (hasFav) profBar.appendChild(makeProfBtn('⭐收藏', '__fav'));
                box.appendChild(profBar);
            }
            const list = document.createElement('div');
            if (multi) {
                // 多列密度：'2'|'3'|'4' 走固定列数；其它走自适应
                const colsCss = cols === '4' ? 'repeat(4,1fr)'
                              : cols === '3' ? 'repeat(3,1fr)'
                              : cols === '2' ? 'repeat(2,1fr)'
                              : 'repeat(auto-fill,minmax(88px,1fr))';
                list.style.cssText = 'overflow-y:auto;flex:1;min-height:0;display:grid;grid-template-columns:' + colsCss + ';gap:6px;align-content:start;padding:2px;';
            } else {
                list.style.cssText = 'overflow-y:auto;flex:1;min-height:0;';
            }
            box.appendChild(list);
            // 多选底部操作栏
            let _doneBtn = null, _infoEl = null;
            if (multi) {
                const actionBar = document.createElement('div');
                actionBar.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
                const info = document.createElement('div');
                info.style.cssText = 'flex:1;align-self:center;font-size:0.8rem;color:rgba(255,255,255,0.7);';
                const done = document.createElement('button');
                done.textContent = '完成 (0)';
                done.style.cssText = 'padding:8px 16px;border:none;border-radius:8px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;';
                done.onclick = function() {
                    const vals = Array.from(selectedCards);
                    const its = items.filter(function(it) { return selectedCards.has(pickKey(it)); });
                    overlay.remove();
                    onPick(vals, its);
                };
                actionBar.appendChild(info); actionBar.appendChild(done);
                box.appendChild(actionBar);
                _doneBtn = done; _infoEl = info;
            }
            function pickKey(it) { return (it && it._ds && it._ds.id) ? it._ds.id : (it ? it.value : ''); }
            function render(q) {
                q = (q || '').trim().toLowerCase();
                list.innerHTML = '';
                let shown = 0;
                items.forEach(function(it) {
                    const label = (it.label != null ? it.label : it.value);
                    const py = (it.py != null ? it.py : window.hanziInitials(label)).toLowerCase();
                    const hit = !q || label.toLowerCase().indexOf(q) >= 0 || py.indexOf(q) >= 0;
                    if (!hit) return;
                    if (selectedProf) {
                        if (selectedProf === '__fav') { if (!it.favorite) return; }
                        else { if (it.profession !== selectedProf) return; }
                    }
                    shown++;
                    const profCn = (it.profession && window.professionToCn) ? window.professionToCn(it.profession) : it.profession;
                    const row = document.createElement('div');
                    const key = pickKey(it);
                    const isSel = multi && selectedCards.has(key);
                    if (multi) {
                        // 两行布局：上行卡名(粗+省略), 下行职业标签(小字); 不再被一行裁切显得拥挤
                        row.style.cssText = 'padding:5px 6px;border-radius:7px;cursor:pointer;color:' + (it.current ? '#4caf50' : '#fff') + ';font-size:0.78rem;line-height:1.25;border:1px solid ' + (isSel ? 'rgba(76,175,80,0.9)' : 'rgba(255,255,255,0.12)') + ';background:' + (isSel ? 'rgba(76,175,80,0.18)' : 'rgba(255,255,255,0.04)') + ';position:relative;overflow:hidden;min-height:42px;display:flex;flex-direction:column;gap:1px;box-sizing:border-box;';
                        const nameEl = document.createElement('div');
                        nameEl.textContent = label;
                        nameEl.style.cssText = 'font-weight:600;font-size:0.82rem;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;';
                        row.appendChild(nameEl);
                        const subEl = document.createElement('div');
                        const subParts = [];
                        if (profCn) subParts.push(profCn);
                        if (it.sub) subParts.push(it.sub);
                        if (it.current) subParts.push('✓');
                        subEl.textContent = subParts.join(' · ');
                        subEl.style.cssText = 'font-size:0.66rem;color:rgba(255,255,255,0.55);text-overflow:ellipsis;overflow:hidden;white-space:nowrap;';
                        row.appendChild(subEl);
                        if (isSel) { const badge = document.createElement('span'); badge.textContent = '✓'; badge.style.cssText = 'position:absolute;top:2px;right:4px;color:#81c784;font-size:0.8rem;font-weight:bold;'; row.appendChild(badge); }
                    } else {
                        row.style.cssText = 'padding:7px 10px;border-radius:7px;cursor:pointer;color:' + (it.current ? '#4caf50' : '#fff') + ';font-size:0.85rem;' + (it.current ? 'background:rgba(76,175,80,0.12);' : '');
                    }
                    if (!multi) row.textContent = label + (profCn ? ('  ·  ' + profCn) : '');
                    if (multi) {
                        row.onclick = function() {
                            if (selectedCards.has(key)) selectedCards.delete(key); else selectedCards.add(key);
                            render(inp.value);
                        };
                    } else {
                        row.onmouseenter = function() { if (!it.current) row.style.background = 'rgba(255,255,255,0.08)'; };
                        row.onmouseleave = function() { if (!it.current) row.style.background = 'transparent'; };
                        row.onclick = function() { onPick(it.value, it); overlay.remove(); };
                    }
                    list.appendChild(row);
                });
                if (shown === 0) {
                    const e = document.createElement('div');
                    e.textContent = '无匹配项';
                    e.style.cssText = 'padding:10px;color:rgba(255,255,255,0.5);font-size:0.8rem;text-align:center;' + (multi ? 'grid-column:1/-1;' : '');
                    list.appendChild(e);
                }
                if (multi) { _infoEl.textContent = '已选 ' + selectedCards.size + ' 张'; _doneBtn.textContent = '完成 (' + selectedCards.size + ')'; }
            }
            inp.oninput = function() { render(inp.value); };
            render('');
            if (!noBackdrop && !floating) {
                overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
            }
            parent.appendChild(overlay);
            setTimeout(function() { try { inp.focus(); } catch (e) {} }, 50);
        }
        window.openGenericPicker = openGenericPicker;
        // ==================== Service Worker 注册（PWA缓存） ====================
        // 首次访问缓存资源，后续打开用缓存秒开，后台静默更新
        // 关键体验：优先用缓存秒开（打开速度不受影响），后台拉到新资源后弹提示「新版本已就绪」
        if ('serviceWorker' in navigator) {
            // 监听 SW 通知：后台已拉到新版本
            navigator.serviceWorker.addEventListener('message', function(event) {
                if (event.data && event.data.type === 'NEW_VERSION_READY') {
                    // 标记「已有新版本」→ 版本号变绿 + 弹卡片（只有真有新版本才触发）
                    window.__tfjlHasNewVersion = true;
                    _markNewVersionAvailable();
                    showNewVersionReadyBar();
                    // 自动刷新以应用新版本：避免"缓存旧 JS 导致按钮无反应"反复发生。
                    // 仅在无弹窗、无输入焦点时刷新，防止丢失未保存内容。
                    setTimeout(function() {
                        try {
                            var ov = document.getElementById('recognizeOverlay');
                            if (ov && ov.style.display !== 'none') return; // 识别浮窗开着，不刷
                            var ae = document.activeElement;
                            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return; // 正在输入，不刷
                            location.reload(true);
                        } catch (e) { /* 出错则交回手动刷新 */ }
                    }, 1500);
                }
                // SW 回报的缓存版本号（如 tfjl-v62）→ 显示在右下角版本标签，便于核对缓存是否更新
                if (event.data && event.data.type === 'SW_VERSION') {
                    updateCacheVersionDisplay(event.data.version);
                }
            });
            // 标记有新版本可用：版本号变绿高亮 + 加个绿点，无需用户去猜
            function _markNewVersionAvailable() {
                window.__tfjlHasNewVersion = true;
                const tag = document.getElementById('versionTag');
                if (!tag) return;
                tag.style.color = '#4caf50';
                tag.style.opacity = '1';
                tag.title = '有新版本可用，点击查看 / 强制刷新';
                if (!document.getElementById('__verNewDot')) {
                    const dot = document.createElement('span');
                    dot.id = '__verNewDot';
                    dot.textContent = ' ●';
                    dot.style.cssText = 'color:#4caf50;';
                    tag.appendChild(dot);
                }
            }
            // 把 SW 缓存版本号显示到右下角版本标签（如 "v260727-57 · sw-v62"）
            function updateCacheVersionDisplay(swVersion) {
                const tag = document.getElementById('versionTag');
                if (!tag || !swVersion) return;
                const short = swVersion.indexOf('tfjl-') === 0 ? swVersion.slice('tfjl-'.length) : swVersion;
                const base = tag.textContent.split(' · ')[0];
                tag.textContent = base + ' · ' + short;
            }
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(function(registration) {
                    console.log('[PWA] Service Worker 注册成功，scope:', registration.scope);
                    // 每次打开 APP 主动检查 SW 更新（绕过 Tauri WebView 的 SW 更新检测问题）
                    registration.update().catch(function() {});
                    // 向当前 SW 询问缓存版本号并显示到版本标签（controller 未就绪时稍后 controllerchange 再问）
                    const askSwVersion = function() {
                        if (navigator.serviceWorker.controller) {
                            navigator.serviceWorker.controller.postMessage({ type: 'GET_SW_VERSION' });
                        }
                    };
                    askSwVersion();
                    navigator.serviceWorker.addEventListener('controllerchange', askSwVersion);
                    // 监听 SW 安装完成
                    registration.addEventListener('updatefound', function() {
                        var newWorker = registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', function() {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('[PWA] 新 Service Worker 已安装，等待激活');
                                }
                            });
                        }
                    });
                }).catch(function(err) {
                    console.warn('[PWA] Service Worker 注册失败:', err);
                });
            });
        }

        // 右下角「新版本已就绪」悬浮卡片（精致、不打扰，点一下刷新即用新版）
        let _newVersionBarShown = false;
        function showNewVersionReadyBar() {
            if (_newVersionBarShown) return;
            _newVersionBarShown = true;
            const card = document.createElement('div');
            card.style.cssText = 'position:fixed;bottom:24px;right:16px;z-index:100001;background:rgba(26,26,46,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:12px;font-size:0.85rem;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,0.45);border:1px solid rgba(76,175,80,0.4);max-width:300px;transform:translateX(120%);transition:transform 0.4s cubic-bezier(0.22,1,0.36,1);';
            card.innerHTML = '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#4caf50,#2e7d32);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🔄</div>'
                           + '<div style="flex:1;min-width:0;"><div style="font-weight:600;color:#81c784;line-height:1.3;">新版本已就绪</div><div style="font-size:0.75rem;color:rgba(255,255,255,0.6);margin-top:2px;">点击立即刷新使用</div></div>';
            const closeBtn = document.createElement('div');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = 'opacity:0.5;cursor:pointer;padding:2px 6px;font-size:0.8rem;flex-shrink:0;border-radius:4px;';
            closeBtn.onmouseenter = function() { closeBtn.style.opacity = '1'; closeBtn.style.background = 'rgba(255,255,255,0.1)'; };
            closeBtn.onmouseleave = function() { closeBtn.style.opacity = '0.5'; closeBtn.style.background = 'transparent'; };
            closeBtn.onclick = function(e) {
                e.stopPropagation();
                card.style.transform = 'translateX(120%)';
                setTimeout(() => { card.remove(); _newVersionBarShown = false; }, 400);
            };
            card.appendChild(closeBtn);
            card.onclick = function() {
                // 强制从网络重新加载，确保拿到后台已拉取的最新资源
                location.reload(true);
            };
            document.body.appendChild(card);
            // 触发滑入动画
            requestAnimationFrame(() => { card.style.transform = 'translateX(0)'; });
        }

        // 点击右下角版本号 → 弹出版本详情 + 强制刷新（解决「看不清版本/跟不上新版」痛点）
        let _versionPopupShown = false;
        // 填充版本弹窗主体（hasNew 决定按钮文案/动作）。
        // 抽出来是因为要异步拉远端 versionTag，检测到新版本时无需重建整个 overlay，只重填 body。
        function _fillVersionPopupBody(frontVer, swVer, appVer, hasNew, box) {
            box.innerHTML = '<div style="font-size:1.05rem;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">📌 版本信息</div>'
                + '<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:rgba(255,255,255,0.6);">前端标记</span><span style="font-weight:600;">' + escapeHtml(frontVer) + '</span></div>'
                + '<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:rgba(255,255,255,0.6);">缓存版本(SW)</span><span style="font-weight:600;">' + escapeHtml(swVer) + '</span></div>'
                + '<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:rgba(255,255,255,0.6);">App版本</span><span style="font-weight:600;">' + escapeHtml(appVer) + '</span></div>'
                + '<div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:12px;line-height:1.5;">' + (hasNew
                ? '检测到服务器已有新版本，点下面按钮立即刷新即可拿到最新。'
                : '当前已是服务器最新版本，无需刷新。') + '</div>';
            const btn = document.createElement('button');
            if (hasNew) {
                btn.textContent = '♻️ 强制刷新获取最新';
                btn.style.cssText = 'margin-top:16px;width:100%;padding:11px;border:none;border-radius:10px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;font-size:0.9rem;font-weight:600;cursor:pointer;';
                btn.onmouseenter = function() { btn.style.filter = 'brightness(1.1)'; };
                btn.onmouseleave = function() { btn.style.filter = 'none'; };
                btn.onclick = function() {
                    _removeVersionPopup();
                    if (typeof forceRefreshLatest === 'function') forceRefreshLatest();
                    else location.reload(true);
                };
            } else {
                btn.textContent = '✅ 已是最新版本（无需刷新）';
                btn.disabled = true;
                btn.style.cssText = 'margin-top:16px;width:100%;padding:11px;border:none;border-radius:10px;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);font-size:0.9rem;font-weight:600;cursor:default;opacity:0.8;';
            }
            box.appendChild(btn);
            // 仍有极少数情况需要手动强刷（如缓存异常）→ 给一个低调的入口
            if (!hasNew) {
                const link = document.createElement('div');
                link.textContent = '仍要强制刷新 ›';
                link.style.cssText = 'margin-top:8px;text-align:center;font-size:0.72rem;color:rgba(255,255,255,0.4);cursor:pointer;text-decoration:underline;';
                link.onclick = function() {
                    _removeVersionPopup();
                    if (typeof forceRefreshLatest === 'function') forceRefreshLatest();
                    else location.reload(true);
                };
                box.appendChild(link);
            }
            // ===== 皮肤修正已移入右上角菜单「重置皮肤」（一键全部重置，无需逐英雄选择）=====
        }
        // 改/恢复皮肤后即时刷新所有槽位 + 手牌皮肤（出问题的用户点完立刻看到效果）
        async function _refreshAllHeroSkins() {
            try {
                document.querySelectorAll('.battle-slot.filled').forEach(async slot => {
                    const name = (typeof getSlotCardName === 'function') ? getSlotCardName(slot) : (slot.dataset.name || '');
                    if (name && typeof applySkinBgToSlot === 'function') { try { await applySkinBgToSlot(slot, name); } catch (e) {} }
                });
                ['myHandContainer', 'teammateHandContainer'].forEach(id => {
                    const c = document.getElementById(id); if (!c) return;
                    c.querySelectorAll('.selected-card').forEach(async card => {
                        const name = card.dataset.name || ''; if (!name || !window.resolveHeroSkinUrl) return;
                        const baseHero = (typeof getBaseHeroName === 'function') ? getBaseHeroName(name).heroName : name;
                        const sel = window.heroSkinSelections ? window.heroSkinSelections[baseHero] : undefined;
                        try {
                            const url = await window.resolveHeroSkinUrl(name, sel);
                            if (url && typeof applySkinBgToHandCard === 'function') applySkinBgToHandCard(card, url);
                            else if (typeof removeSkinBgFromHandCard === 'function') removeSkinBgFromHandCard(card);
                        } catch (e) {}
                    });
                });
                if (typeof refreshAllFusionSkins === 'function') refreshAllFusionSkins();
            } catch (e) { console.warn('刷新皮肤失败:', e); }
        }
        // 拉远端 index.html 解析前端 versionTag —— 不依赖 Service Worker（Tauri WebView 下 SW message 通道不可靠，
        // 导致 __tfjlHasNewVersion 永远收不到 NEW_VERSION_READY）。优先 raw.githubusercontent (CORS *)，失败回退同域 GitHub Pages。
        async function _checkRemoteFrontVerAsync() {
            const sources = [
                'https://raw.githubusercontent.com/gyq-svip/tfjl-web/main/index.html?t=' + Date.now(),
                'https://gyq-svip.github.io/tfjl-web/index.html?t=' + Date.now()
            ];
            for (const u of sources) {
                try {
                    const r = await fetch(u, { cache: 'no-store' });
                    if (r.ok) {
                        const txt = await r.text();
                        const m = txt.match(/id="versionTag"[^>]*>([^<]+)</);
                        if (m) return m[1].trim();
                    }
                } catch (e) { /* 试下一个源 */ }
            }
            return null;
        }
        async function onVersionTagClick() {
            if (_versionPopupShown) { _removeVersionPopup(); return; }
            _versionPopupShown = true;
            // 获取 SW 缓存版本号（实时问 SW）
            let swVer = (function() {
                const tag = document.getElementById('versionTag');
                const parts = tag ? tag.textContent.replace('●', '').split(' · ') : [];
                return parts[1] || '加载中…';
            })();
            if (swVer === '加载中…') {
                try {
                    await new Promise((resolve) => {
                        const onMsg = (e) => {
                            if (e.data && e.data.type === 'SW_VERSION') {
                                swVer = e.data.version.indexOf('tfjl-') === 0 ? e.data.version.slice('tfjl-'.length) : e.data.version;
                                navigator.serviceWorker.removeEventListener('message', onMsg);
                                resolve();
                            }
                        };
                        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                            navigator.serviceWorker.addEventListener('message', onMsg);
                            navigator.serviceWorker.controller.postMessage({ type: 'GET_SW_VERSION' });
                            setTimeout(resolve, 1200);
                        } else { resolve(); }
                    });
                } catch (e) {}
            }
            const frontVer = (function() {
                const tag = document.getElementById('versionTag');
                const parts = tag ? tag.textContent.replace('●', '').split(' · ') : [];
                return (parts[0] || tag.textContent || '').trim();
            })();
            const appVer = (typeof CURRENT_VERSION !== 'undefined') ? CURRENT_VERSION : '网页版';
            const overlay = document.createElement('div');
            overlay.id = '__versionPopup';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
            overlay.onclick = function(e) { if (e.target === overlay) _removeVersionPopup(); };
            const box = document.createElement('div');
            box.style.cssText = 'background:rgba(26,26,46,0.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;width:300px;max-width:90vw;border-radius:16px;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.12);font-family:inherit;position:relative;';
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            // 先用 SW 是否已报新版本渲染（__tfjlHasNewVersion 由 SW 的 NEW_VERSION_READY 置位）
            _fillVersionPopupBody(frontVer, swVer, appVer, window.__tfjlHasNewVersion === true, box);
            // 异步拉远端 versionTag 比较：不依赖 SW，Tauri WebView 下也能正确检测新前端
            try {
                const remoteVer = await _checkRemoteFrontVerAsync();
                if (remoteVer && remoteVer !== frontVer && !window.__tfjlHasNewVersion) {
                    window.__tfjlHasNewVersion = true;
                    _fillVersionPopupBody(frontVer, swVer, appVer, true, box);  // 刷新为「强制刷新」状态
                }
            } catch (e) {}
            const close = document.createElement('div');
            close.textContent = '✕';
            close.style.cssText = 'position:absolute;top:12px;right:14px;opacity:0.5;cursor:pointer;font-size:0.9rem;z-index:2;';
            close.onclick = function(e) { e.stopPropagation(); _removeVersionPopup(); };
            box.appendChild(close);
        }
        function _removeVersionPopup() {
            const o = document.getElementById('__versionPopup');
            if (o) o.remove();
            _versionPopupShown = false;
        }
        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        // APP本地功能已拆分到 app-local.js（仅Tauri APP加载，网页版不影响）

        function toggleProjectMenu(btn) {
            const menu = document.getElementById('projectMenu');
            if (menu.style.display === 'none' || menu.style.display === '') {
                const rect = btn.getBoundingClientRect();
                // 先显示才能测高度
                menu.style.display = 'block';
                menu.style.left = rect.left + 'px';
                menu.style.top = ''; // 清掉旧值
                // 动态定位：下方空间不够时，让菜单底部贴齐视口底部（不超出屏幕），并启用滚动
                const menuH = menu.offsetHeight;
                const spaceBelow = window.innerHeight - rect.bottom - 8;
                if (menuH > spaceBelow) {
                    // 下方放不下：优先向上展开（贴按钮上方），上方也不够则贴视口底部并滚动
                    const spaceAbove = rect.top - 8;
                    if (spaceAbove > spaceBelow && spaceAbove > 120) {
                        menu.style.top = Math.max(8, rect.top - menuH - 4) + 'px';
                        menu.style.maxHeight = (rect.top - 12) + 'px';
                    } else {
                        menu.style.top = (rect.bottom + 4) + 'px';
                        menu.style.maxHeight = spaceBelow + 'px';
                    }
                } else {
                    menu.style.top = (rect.bottom + 5) + 'px';
                    menu.style.maxHeight = '85vh';
                }
            } else {
                menu.style.display = 'none';
            }
        }

        document.addEventListener('click', function(e) {
            if (!e.target.matches('button[onclick^="toggleProjectMenu"]') && !e.target.closest('#projectMenu')) {
                document.getElementById('projectMenu').style.display = 'none';
            }
        });

        // 导出当前项目
        function exportCurrentProject() {
            if (!requireLogin()) return;
            const projectName = document.getElementById('projectSelector1').value;
            if (!projectName) {
                alert('请先选择一个项目！');
                return;
            }

            const cat = currentProjectCategory || '默认分类';

            loadProjectListFromDB().then(allProjects => {
                const project = allProjects.find(p => p.name === projectName && p.category === cat);
                if (!project) {
                    alert('未找到该项目！');
                    return;
                }

                const exportData = {
                    type: 'tower-defense-project',
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    project: project
                };

                const jsonStr = JSON.stringify(exportData, null, 2);
                const fileName = `塔防阵容_${projectName}_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
                const isTauri = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
                const finish = function() {
                    if (typeof showToast === 'function') showToast('✅ 已备份项目「' + projectName + '」为 JSON 文件（可分享给他人导入）');
                    document.getElementById('projectMenu').style.display = 'none';
                };
                if (isTauri) {
                    // 先让用户选目的地，saved=true 才提示成功；取消不误报
                    _downloadScriptTauri(fileName, jsonStr).then(function(saved) {
                        if (saved) finish(); else document.getElementById('projectMenu').style.display = 'none';
                    });
                } else {
                    _downloadScriptBlob(fileName, jsonStr);
                    finish();
                }
            });
        }

        // （已移除"备份到软件临时区"：默认项目统一由远程 projects/wangcheng-dipin.json 分发，启动时拉取并缓存到本地 IndexedDB，无需用户手动备份）

        // 分享当前阵容项目到需求墙（整项目 JSON，接收方只能智能导入/下载，不支持预览/导入到老马）
        // 复用与脚本分享一致的 Gist 上传 + 加密 + 需求墙消息机制
        async function shareProjectToWall() {
            const projectName = (document.getElementById('projectSelector1') && document.getElementById('projectSelector1').value) || currentProjectName;
            if (!projectName) { alert('请先选择一个项目！'); return; }

            const cat = currentProjectCategory || '默认分类';
            let project = null;
            try {
                const all = await loadProjectListFromDB();
                project = all.find(p => p.name === projectName && (p.category || '默认分类') === cat) || all.find(p => p.name === projectName);
            } catch (e) { project = null; }
            if (!project) { alert('未找到该项目：' + projectName); return; }

            // 强需求：分享前必须设置昵称
            const nick = await ensureNickname();
            if (!nick) { alert('分享阵容需要先设置昵称（昵称仅用于发言/分享展示，设置后不可自行修改）'); return; }

            if (!getGistToken()) { alert('离线版暂不支持发送，请检查网络连接'); return; }

            // 【关键安全】分享前先加载历史消息，避免覆盖
            if (wallMessages.length === 0) {
                try { await fetchMessages(); } catch (e) { console.warn('预加载消息失败:', e); }
            }

            const now = new Date();
            const defaultName = `塔防阵容_${projectName}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
            const inputName = prompt('请输入分享阵容文件名（不含扩展名）：', defaultName);
            if (!inputName) return;
            const fileName = inputName.endsWith('.json') ? inputName : inputName + '.json';

            // 分享选项弹窗（时长 + 密码），与脚本分享一致
            const shareOpts = await new Promise(function(resolve) { showShareOptionsDialog(function(e, p, rk) { resolve([e, p, rk]); }); });
            if (shareOpts === null || shareOpts[0] === null) return;
            const expireMinutes = shareOpts[0];
            const sharePassword = shareOpts[1];
            const recoveryKey = shareOpts[2] || '';

            try {
                const token = getGistToken();
                // 序列化整项目（与导出备份同一格式，接收方智能导入可直接识别）
                const exportData = { type: 'tower-defense-project', version: '1.0', exportDate: new Date().toISOString(), project: project };
                let uploadContent = JSON.stringify(exportData, null, 2);
                let passwordHash = null;
                const willEncrypt = !!(sharePassword || recoveryKey);
                if (willEncrypt) {
                    uploadContent = recoveryKey ? await encryptContentB(uploadContent, sharePassword, recoveryKey) : await encryptContent(uploadContent, sharePassword);
                    passwordHash = await hashPassword(sharePassword || '');
                }

                const response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        description: `阵容分享: ${fileName}` + (willEncrypt ? ' [加密]' : ''),
                        public: true,
                        files: { [fileName]: { content: uploadContent } }
                    })
                });

                if (!response.ok) throw new Error('上传失败');
                const data = await response.json();
                const scriptUrl = data.files[fileName]?.raw_url || `https://gist.githubusercontent.com/${data.id}/raw/${encodeURIComponent(fileName)}`;

                const nickname = localStorage.getItem('TFJL_UserName') || '匿名用户';
                const content = `分享阵容: ${fileName}\n${scriptUrl}`;
                const newMsg = {
                    content: content,
                    author: nickname,
                    time: Date.now(),
                    scriptUrl: scriptUrl,
                    expireMinutes: expireMinutes > 0 ? expireMinutes : null,
                    isEncrypted: !!willEncrypt,
                    shareType: 'project'
                };
                if (passwordHash) newMsg.passwordHash = passwordHash;
                if (recoveryKey) newMsg.encScheme = 'B';

                wallMessages.unshift(newMsg);
                if (wallMessages.length > MAX_MESSAGES) {
                    wallMessages = wallMessages.slice(0, MAX_MESSAGES);
                }

                await saveMessagesToGist();
                renderMessages();
                if (sharePassword || recoveryKey) {
                    showPasswordReminder(fileName, sharePassword, '阵容已分享', recoveryKey);
                } else {
                    showToast('✅ 阵容已分享到需求墙！');
                }
                document.getElementById('projectMenu').style.display = 'none';
            } catch (err) {
                console.error('分享失败:', err);
                alert('分享失败: ' + err.message);
            }
        }

        // 导出当前项目到数据盘（固化成"所有人默认项目"用）：D:\withfriends\塔防精灵助手数据\projects\王城低配版.json
        // 🔴 已删除（2026-08-07）：原函数使用 Tauri v1 API（window.__TAURI__.invoke / .fs.mkdir / .fs.writeTextFile），
        // 实际项目中零调用入口（全项目 grep 无引用），纯死代码。如需此功能，请用「💾 全部备份」+ 手动把 JSON
        // 放到远程仓库 projects/wangcheng-dipin.json，或联系开发者手工固化默认项目。

        function importSingleProject() {
            if (!requireLogin()) return;
            document.getElementById('projectMenu').style.display = 'none';

            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function(e) {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (data.type !== 'tower-defense-project') {
                            alert('无效的项目文件！');
                            return;
                        }

                        // 弹出选择分类的对话框
                        showImportCategoryDialog(data);
                    } catch (err) {
                        alert('文件解析失败：' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        // 显示导入时的分类选择对话框
        function showImportCategoryDialog(data) {
            const modal = document.createElement('div');
            modal.id = 'importCategoryModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;';

            let categoryOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');
            modal.innerHTML = `
                <div style="background:#1a1a2e;border:2px solid rgba(255,215,0,0.5);border-radius:16px;padding:30px;max-width:500px;width:100%;">
                    <h3 style="margin:0 0 20px 0;color:#ffd700;text-align:center;">📥 导入项目</h3>
                    <div style="margin-bottom:15px;">
                        <label style="color:#fff;display:block;margin-bottom:8px;">项目名称：</label>
                        <input id="importProjectName" value="${data.project.name}" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);background:#2a2a4a;color:#fff;box-sizing:border-box;font-size:1rem;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="color:#fff;display:block;margin-bottom:8px;">选择分类：</label>
                        <select id="importCategorySelect" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);background:#2a2a4a;color:#fff;font-size:1rem;">
                            ${categoryOptions}
                        </select>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin-bottom:15px;font-size:0.85rem;color:rgba(255,255,255,0.7);">
                        <p style="margin:0 0 5px 0;">📋 项目信息：</p>
                        <p style="margin:0 0 3px 0;">• 我的手牌：${data.project.myHandCards?.length || 0} 张</p>
                        <p style="margin:0 0 3px 0;">• 队友手牌：${data.project.teammateHandCards?.length || 0} 张</p>
                        <p style="margin:0 0 3px 0;">• 参考图片：${data.project.referenceImages?.length || 0} 张</p>
                        <p style="margin:0;">• 脚本文件：${data.project.txtFiles?.length || 0} 个</p>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button onclick="confirmImport()" style="flex:1;padding:12px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">确认导入</button>
                        <button onclick="closeImportModal()" style="flex:1;padding:12px;background:#666;color:white;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">取消</button>
                    </div>
                </div>
            `;

            window.pendingImportData = data;
            document.body.appendChild(modal);
        }

        function confirmImport() {
            const data = window.pendingImportData;
            if (!data) return;

            const newName = document.getElementById('importProjectName').value.trim();
            const category = document.getElementById('importCategorySelect').value;

            if (!newName) {
                alert('项目名称不能为空！');
                return;
            }

            // 检查是否已存在同名项目
            loadProjectListFromDB().then(allProjects => {
                const exists = allProjects.find(p => p.name === newName && p.category === category);
                if (exists) {
                    if (!confirm('已存在同名项目，是否覆盖？')) return;
                    deleteProjectFromDB(newName, category);
                }

                // 更新项目名称和分类
                data.project.name = newName;
                data.project.category = category;

                // 直接保存项目数据（包含参考图片和脚本文件）
                if (typeof showToast === 'function') showToast('⏳ 正在恢复项目「' + newName + '」…');
                saveProjectToDBDirect(data.project).then(() => {
                    loadCategoriesFromDB();
                    updateCategorySelector();
                    refreshProjectSelectors();
                    // 刷新下拉后把选中切到刚导入的项目，并自动加载到工作区，避免"重启才出来"
                    setTimeout(() => {
                        const sel = document.getElementById('projectSelector1');
                        if (sel) sel.value = newName;
                        const csel = document.getElementById('categorySelector1');
                        if (csel && category) csel.value = category;
                        loadProjectFromDB(newName).then(() => {
                            if (typeof showToast === 'function') showToast('✅ 已恢复并打开项目「' + newName + '」');
                        }).catch(err => {
                            if (typeof showToast === 'function') showToast('✅ 项目已保存「' + newName + '」，请在下拉选择打开');
                        });
                    }, 150);
                }).catch(err => {
                    console.error('恢复项目失败', err);
                    if (typeof showToast === 'function') showToast('❌ 恢复项目失败：' + (err && err.message ? err.message : err));
                });

                closeImportModal();
            });
        }

        // 直接保存项目数据到数据库（不依赖全局变量）
        function saveProjectToDBDirect(projectData) {
            return new Promise((resolve, reject) => {
                if (!db) {
                    reject('DB not initialized');
                    return;
                }

                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(projectData);

                request.onsuccess = function() {
                    persistProjectsToDisk();
                    resolve();
                };

                request.onerror = function(event) {
                    reject(event.target.error);
                };
            });
        }

        // 仅获取项目数据（不影响当前项目状态，不更新界面）
        function getProjectFromDB(projectName) {
            return new Promise((resolve, reject) => {
                if (!db) {
                    reject('DB not initialized');
                    return;
                }

                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(projectName);

                request.onsuccess = function(event) {
                    resolve(event.target.result);
                };

                request.onerror = function(event) {
                    reject(event.target.error);
                };
            });
        }

        function closeImportModal() {
            const modal = document.getElementById('importCategoryModal');
            if (modal) modal.remove();
            window.pendingImportData = null;
        }
        