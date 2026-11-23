# -*- coding: utf-8 -*-
"""从微信小游戏官方缓存的 resources bundle 提取 Spine 模型三件套。

数据源：官方微信小游戏缓存（APPID wxa46b2910643e4c31）里的 resources 资源包，
        纹理从官方资源 CDN 拉取。不依赖任何第三方工具箱或离线整理包。

方法（已在 shuiyuansu / hongriqing 等模型上字节级验证）：
  manifest["paths"] 中 key -> [资源路径, 类型...]；
  [3] = sp.SkeletonData，其 a[0][0][2] = atlas 文本、[4] = skeleton JSON；
  [2,1] = SpriteFrame，其 [5][0] -> b1[ref] 得到 Cocos 22 字符压缩 uuid，
  解码成标准 uuid 后按 CDN 规则取 PNG。

用法：
  python scripts/export-heroes/extract-official-spine.py                # 只读报告：官方可提取清单 + 本地模型数
  python ... --list                                                      # 列出 bundle 里所有官方英雄 Spine 资源路径
  python ... --target combat/animation/hero/jingling/kongmingdeng        # 提取单个模型（自动推 folder/model）
  python ... --all-missing                                               # 扫描本地缺 skeleton.json 的目录并补齐
  TFJL_GAMECACHES=<目录> python ...                                       # 手动指定缓存位置
"""
import argparse
import glob
import json
import os
import sys
import urllib.request

APPID = 'wxa46b2910643e4c31'
CDN = 'https://tfjlwecdn.gameserver.iplay11g.com/res/remote/resources/native'
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
HEX = '0123456789abcdef'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_BASE = os.path.join(ROOT, 'data', 'hero-spine')


def decode_uuid(s):
    """Cocos 22 字符压缩 uuid -> 标准 36 字符 uuid"""
    if len(s) != 22:
        return s
    idxs = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17,
            19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]
    out = [''] * 36
    for i in (8, 13, 18, 23):
        out[i] = '-'
    out[0], out[1] = s[0], s[1]
    j = 2
    for i in range(2, 22, 2):
        lhs, rhs = B64.index(s[i]), B64.index(s[i + 1])
        for h in (lhs >> 2, ((lhs & 3) << 2) | (rhs >> 4), rhs & 0xF):
            out[idxs[j]] = HEX[h]
            j += 1
    return ''.join(out)


def valid_cache(d):
    res = os.path.join(d, 'resources')
    return os.path.isdir(res) and any(f.endswith('.json') for f in os.listdir(res))


def find_gamecaches():
    env = os.environ.get('TFJL_GAMECACHES')
    if env and valid_cache(env):
        return env
    homes = [
        'D:/systeam/Documents/WeChat Files',
        'C:/Users/Administrator/Documents/WeChat Files',
        os.path.expanduser('~/Documents/WeChat Files'),
        os.path.expanduser('~/AppData/Roaming/Tencent/xwechat/radium/users'),
    ]
    for home in homes:
        if not os.path.isdir(home):
            continue
        for acct in os.listdir(home):
            base = os.path.join(home, acct)
            if not os.path.isdir(base):
                continue
            for rel in (os.path.join('Applet', APPID, 'usr', 'gamecaches'),
                        os.path.join('applet', 'local', APPID, 'usr', 'gamecaches'),
                        os.path.join('usr', 'gamecaches')):
                cand = os.path.join(base, rel)
                if valid_cache(cand):
                    return cand
    return None


def load_bundle(res_dir):
    """自动识别 manifest(dict: paths/uuids/versions) 与 bundle(list: [1]=refs,[5]=entries)"""
    jsons = sorted(glob.glob(os.path.join(res_dir, '*.json')),
                   key=lambda f: os.path.getsize(f))
    manifest = bundle = None
    for f in jsons:
        size = os.path.getsize(f)
        if size > 40 * 1024 * 1024:
            continue
        try:
            with open(f, encoding='utf-8') as fh:
                d = json.load(fh)
        except Exception:
            continue
        if manifest is None and isinstance(d, dict) and all(k in d for k in ('paths', 'uuids', 'versions')):
            manifest = (f, d)
        elif bundle is None and isinstance(d, list) and len(d) > 5 and isinstance(d[5], list):
            bundle = (f, d)
    # bundle 通常是最大的那个 json（30MB+），上面按大小升序会最后处理；单独兜底
    if bundle is None:
        big = max(jsons, key=os.path.getsize, default=None)
        if big:
            with open(big, encoding='utf-8') as fh:
                d = json.load(fh)
            if isinstance(d, list) and len(d) > 5:
                bundle = (big, d)
    if not manifest or not bundle:
        raise RuntimeError('resources 目录里没找到官方 manifest / bundle JSON')
    return manifest, bundle


class OfficialSpine:
    def __init__(self, cache_dir):
        self.cache_dir = cache_dir
        mf, bf = load_bundle(os.path.join(cache_dir, 'resources'))
        self.manifest_file, mani = mf
        self.bundle_file, b = bf
        self.b1, self.b5 = b[1], b[5]
        pack_ids = mani['packs'][list(mani['packs'].keys())[0]]
        self.pos_of = {aid: pos for pos, aid in enumerate(pack_ids)}
        self.u2idx = {u: i for i, u in enumerate(mani['uuids'])}
        vn = mani['versions']['native']
        self.native_hash = {vn[i]: vn[i + 1] for i in range(0, len(vn), 2)}
        self.paths = mani['paths']

    def hero_paths(self):
        return sorted({v[0] for v in self.paths.values()
                       if isinstance(v, list) and v and isinstance(v[0], str)
                       and v[0].startswith('combat/animation/hero/')})

    def entry(self, path, tail):
        for k, v in self.paths.items():
            if isinstance(v, list) and v and v[0] == path and list(v[1:]) == list(tail):
                return self.b5[self.pos_of[int(k)]]
        return None

    def extract(self, path, folder=None, model=None, overwrite=False):
        tail = path.rstrip('/').split('/')
        folder = folder or (tail[-2] if len(tail) >= 2 else '')
        model = model or tail[-1]
        dest = os.path.join(OUT_BASE, folder, 'models', model)
        skel_file = os.path.join(dest, 'skeleton.json')
        if os.path.isfile(skel_file) and not overwrite:
            return 'skip', dest
        a = self.entry(path, [3])
        sf = self.entry(path, [2, 1])
        if not a or not sf:
            return 'missing-entry', path
        try:
            inner = a[0][0]
            atlas, skel = inner[2], inner[4]
            if not isinstance(skel, dict) or 'bones' not in skel:
                return 'bad-skeleton', path
            ref = sf[5][0]
            tu = self.b1[ref]
            thash = self.native_hash.get(self.u2idx.get(tu))
            full = decode_uuid(tu)
            url = '%s/%s/%s.%s.png' % (CDN, full[:2], full, thash)
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = urllib.request.urlopen(req, timeout=60).read()
            if data[:4] != b'\x89PNG':
                return 'not-png', url
            os.makedirs(dest, exist_ok=True)
            with open(os.path.join(dest, 'atlas.txt'), 'w', encoding='utf-8', newline='') as f:
                f.write(atlas)
            with open(skel_file, 'w', encoding='utf-8') as f:
                json.dump(skel, f, ensure_ascii=False)
            with open(os.path.join(dest, 'p0.png'), 'wb') as f:
                f.write(data)
            return 'ok', dest
        except Exception as e:
            return 'error:%s' % e, path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true', help='列出官方 bundle 里的英雄 Spine 资源路径')
    ap.add_argument('--target', help='提取指定的官方资源路径')
    ap.add_argument('--folder', help='（配合 --target）本地英雄目录名')
    ap.add_argument('--model', help='（配合 --target）本地模型目录名')
    ap.add_argument('--all-missing', action='store_true', help='补齐本地缺 skeleton.json 的模型')
    ap.add_argument('--overwrite', action='store_true', help='允许覆盖已存在的模型')
    args = ap.parse_args()

    cache = find_gamecaches()
    if not cache:
        print('✗ 未找到官方微信小游戏缓存，请设置 TFJL_GAMECACHES=<gamecaches 目录>')
        sys.exit(1)
    spine = OfficialSpine(cache)
    paths = spine.hero_paths()
    local_models = glob.glob(os.path.join(OUT_BASE, '*', 'models', '*'))
    missing_local = [d for d in local_models if not os.path.isfile(os.path.join(d, 'skeleton.json'))]

    print('=== 官方 Spine 数据源 ===')
    print('  缓存目录 :', cache)
    print('  manifest :', os.path.basename(spine.manifest_file))
    print('  bundle   :', os.path.basename(spine.bundle_file))
    print('  官方英雄 Spine 路径数 :', len(paths))
    print('  本地模型目录 :', len(local_models), '（缺 skeleton.json：', len(missing_local), '）')

    if args.list:
        for p in paths:
            print('  ', p)
        return
    if args.target:
        status, info = spine.extract(args.target, args.folder, args.model, args.overwrite)
        print('\n--target:', status, info)
        return
    if args.all_missing:
        if not missing_local:
            print('\n· 本地模型齐全，无需补齐')
            return
        ok = 0
        for d in missing_local:
            parts = d.replace('\\', '/').split('/')
            folder, model = parts[-3], parts[-1]
            path = 'combat/animation/hero/%s/%s' % (folder, model)
            status, info = spine.extract(path, folder, model, args.overwrite)
            print('  %-14s %s (%s)' % (status, model, info))
            ok += status == 'ok'
        print('\n✓ 成功补齐 %d / %d' % (ok, len(missing_local)))
        return
    print('\n（只读模式。--list 看清单 / --target 提取单个 / --all-missing 补齐缺失）')


if __name__ == '__main__':
    main()
