// 本地识别服务器：让 ai-recognize-test.html 通过 http://localhost 同源访问，
// 从而 Tesseract 的 Worker / wasm 能正常创建（file:// 会被浏览器安全策略禁止）。
// - /tessdata/ 路由到软件数据目录（D:\withfriends\塔防精灵助手数据\tessdata）
// - 其余（含本页 HTML、skins/ 模板底图）路由到项目目录（C:\gyq\tfjl\tfjl-web）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\gyq\\tfjl\\tfjl-web';                       // 项目目录（本文件所在目录的上级）
const TESS = 'D:\\withfriends\\塔防精灵助手数据\\tessdata';    // OCR 资源目录（与 tfjl.dat 同目录）
const LAOMA = 'D:\\withfriends\\塔防老马助手';                // 老马助手本地目录（直接引用其资源，零拷贝）
const RESEARCH = 'D:\\withfriends\\塔防精灵助手数据\\research'; // 研究抽取产物（卡名表/阵容库等），统一放在助手自己的数据目录下
const PORT = 8765;

const TYPES = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript',
  '.gz':'application/gzip',
  '.wasm.js':'application/javascript',
  '.json':'application/json',
  '.png':'image/png',
  '.css':'text/css',
  '.svg':'image/svg+xml',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.bmp':'image/bmp',
  '.tif':'image/tiff',
  '.tiff':'image/tiff',
  '.gif':'image/gif',
  '.webp':'image/webp'
};

http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let fp;
  if (p.startsWith('/tessdata/')) {
    fp = path.join(TESS, p.slice('/tessdata/'.length));      // OCR 资源走 D 盘软件目录
  } else if (p.startsWith('/laoma/')) {
    fp = path.join(LAOMA, p.slice('/laoma/'.length));        // 老马资源走其本地安装目录
  } else if (p.startsWith('/research/')) {
    fp = path.join(RESEARCH, p.slice('/research/'.length));  // 研究抽取产物走 D 盘研究目录
  } else {
    fp = path.join(ROOT, p);
    if (p === '/' || p === '') fp = path.join(ROOT, 'tools/ai-recognize-test.html');
  }
  if (req.method === 'POST' && p.startsWith('/research/')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const fn = p.slice('/research/'.length);
      if (fn !== 'lineups_user.json') { res.writeHead(403); res.end('forbidden'); return; }
      try { fs.writeFileSync(path.join(RESEARCH, fn), body); res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'}); res.end('saved'); }
      catch (e) { res.writeHead(500); res.end('' + e); }
    });
    return;
  }
  // —— Umi-OCR 本地服务代理（同源转发到 127.0.0.1:1224，避开浏览器 CORS / 混合内容）——
  if (p === '/umi-ocr' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const ureq = http.request({ host:'127.0.0.1', port:1224, path:'/api/ocr', method:'POST',
        headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} }, ures => {
        let ud=''; ures.on('data',c=>ud+=c); ures.on('end',()=>{ res.writeHead(ures.statusCode,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'}); res.end(ud); });
      });
      ureq.on('error', e => { res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({code:-1,data:'Umi-OCR 未运行或代理错误: '+e.message})); });
      ureq.write(body); ureq.end();
    });
    return;
  }
  if (p === '/umi-options' && req.method === 'GET') {
    const ureq = http.request({ host:'127.0.0.1', port:1224, path:'/api/ocr/get_options', method:'GET' }, ures => {
      let ud=''; ures.on('data',c=>ud+=c); ures.on('end',()=>{ res.writeHead(ures.statusCode,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'}); res.end(ud); });
    });
    ureq.on('error', e => { res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({error:e.message})); });
    ureq.end();
    return;
  }
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('404: ' + fp); return; }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream'});
    res.end(d);
  });
}).listen(PORT, () => {
  console.log('本地识别服务器已启动');
  console.log('请在浏览器打开：');
  console.log('  http://localhost:' + PORT + '/tools/ai-recognize-test.html');
  console.log('OCR 资源(tessdata)来自：' + TESS);
});
