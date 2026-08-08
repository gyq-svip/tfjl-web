
    // 非首次启动跳过启动动画（SW缓存已命中，页面已渲染，动画反而挡屏幕）
    (function(){
        var notFirst = false;
        try { notFirst = !!localStorage['TFJL_NotFirst']; } catch(e) {}
        if(notFirst){
            // 统一走 index.html 内联定义的隐藏函数（含淡出与移除）；取不到时退回直接隐藏
            if (window._hideLoadingScreen) { window._hideLoadingScreen('非首次启动'); return; }
            var s=document.getElementById('appLoadingScreen');
            if(s)s.style.display='none';
        }
    })();
