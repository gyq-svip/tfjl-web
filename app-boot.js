
    // 非首次启动跳过启动动画（SW缓存已命中，页面已渲染，动画反而挡屏幕）
    (function(){
        if(localStorage['TFJL_NotFirst']){
            var s=document.getElementById('appLoadingScreen');
            if(s)s.style.display='none';
        }
    })();
    