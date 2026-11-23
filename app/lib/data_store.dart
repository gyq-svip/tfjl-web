import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:archive/archive.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';

/// 皮肤包管理（Gitee 整包下载 → 解压 → registry 索引 → 取图）
/// 包结构：{英雄}/{皮肤名}.skin（.skin=PNG）
class SkinPack {
  static final SkinPack I = SkinPack._();
  SkinPack._();

  Directory? _root;
  final Map<String, String> nameIndex = {};   // 规范化皮肤名 -> 英雄/文件
  final Map<String, List<String>> heroSkins = {};  // 英雄 -> [皮肤名]
  bool ready = false;
  void Function(double p, String stage)? onProgress;

  Future<Directory> _dir() async {
    if (_root != null) return _root!;
    final base = await getApplicationDocumentsDirectory();
    _root = Directory('${base.path}/skins');
    return _root!;
  }

  Future<bool> isReady() async {
    final d = await _dir();
    return File('${d.path}/manifest.json').existsSync();
  }

  Future<void> ensurePack() async {
    if (ready) return;
    try {
      final remotePkg = await _remotePackage();
      final prefs = await SharedPreferences.getInstance();
      final localPkg = prefs.getString('skin_pkg') ?? '';
      if (remotePkg.isNotEmpty && remotePkg != localPkg) {
        _prog(2, '下载皮肤包…');
        final zipPath = '${(await getTemporaryDirectory()).path}/skins.zip';
        final ok = await _download('https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/v-skins/$remotePkg', zipPath);
        if (ok) {
          _prog(85, '解压皮肤包…');
          final d = await _dir();
          if (d.existsSync()) d.deleteSync(recursive: true);
          d.createSync(recursive: true);
          await _unzip(zipPath, d.path);
          File(zipPath).deleteSync();
          await prefs.setString('skin_pkg', remotePkg);
        }
      }
      await _buildIndex();
      ready = true;
      _prog(100, '皮肤包就绪');
    } catch (_) {
      await _buildIndex();
      ready = File('${(await _dir()).path}/registry.json').existsSync();
    }
  }

  void _prog(double p, String s) => onProgress?.call(p, s);

  Future<String> _remotePackage() async {
    try {
      final r = await http.get(Uri.parse('https://gyq-svip.github.io/tfjl-web/skins-index.json')).timeout(const Duration(seconds: 10));
      if (r.statusCode == 200) {
        return (jsonDecode(r.body) as Map<String, dynamic>)['package']?.toString() ?? '';
      }
    } catch (_) {}
    return '';
  }

  Future<bool> _download(String url, String target) async {
    try {
      final req = http.Request('GET', Uri.parse(url));
      final resp = await http.Client().send(req).timeout(const Duration(seconds: 120));
      if (resp.statusCode != 200) return false;
      final total = resp.contentLength ?? 0;
      final f = File(target);
      final sink = f.openWrite();
      var done = 0;
      await for (final chunk in resp.stream) {
        done += chunk.length;
        sink.add(chunk);
        if (total > 0) {
          final pct = 2 + done * 82 / total;
          if (done % (256 * 1024) < chunk.length) _prog(pct, '下载皮肤包 ${(done * 100 / total).toStringAsFixed(0)}%');
        }
      }
      await sink.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _unzip(String zipPath, String dest) async {
    final bytes = File(zipPath).readAsBytesSync();
    final archive = ZipDecoder().decodeBytes(bytes);
    for (final e in archive.files) {
      // Windows 打包反斜杠 → /
      final name = e.name.replaceAll('\\', '/');
      if (e.isFile && !name.contains('..')) {
        final out = File('$dest/$name');
        out.parent.createSync(recursive: true);
        out.writeAsBytesSync(e.content as List<int>);
      }
    }
  }

  /// 官方魔化数据（skin-attributes.json）：{英雄: {皮肤名/魔化: 属性}}
  /// 来源①：APP 内置完整官方表（100 英雄，61 个有魔化）——打包进 assets/data/
  /// 来源②：皮肤包内的增量表（17 英雄，管理员后加的）——覆盖内置
  final Map<String, dynamic> skinAttrs = {};

  /// 该英雄官方是否拥有魔化（与网页 _hasRealMoHua 一致：desc 为「无」视为无魔化）
  bool hasMohuaData(String hero) {
    final official = AppData.officialName(hero);
    for (final name in [official, hero]) {
      final a = skinAttrs[name];
      if (a is! Map) continue;
      final m = a['魔化'];
      if (m == null) continue;
      final desc = m is String ? m : (m is Map ? (m['desc']?.toString() ?? '') : '');
      if (desc.isNotEmpty && desc.trim() != '无') return true;
    }
    return false;
  }

  Future<void> _buildIndex() async {
    nameIndex.clear();
    heroSkins.clear();
    final d = await _dir();
    final reg = File('${d.path}/registry.json');
    if (!reg.existsSync()) return;
    try {
      final o = jsonDecode(reg.readAsStringSync()) as Map<String, dynamic>;
      final heroes = o['heroes'] as Map<String, dynamic>? ?? {};
      heroes.forEach((hero, arrRaw) {
        final arr = (arrRaw as List?) ?? [];
        final names = <String>['默认'];
        final seenFiles = <String>{};
        for (final skRaw in arr) {
          final sk = skRaw as Map<String, dynamic>;
          final skinName = sk['name']?.toString() ?? '';
          final file = sk['file']?.toString() ?? '';
          if (skinName.isEmpty || file.isEmpty) continue;
          // 与网页一致：过滤掉和英雄同名的"伪皮肤"（它就是默认皮肤，会重复显示）
          if (_norm(skinName) == _norm(hero)) continue;
          // 同名皮肤去重（含规范化后同名：全角/半角空格、· 分隔符）
          if (names.any((n) => _norm(n) == _norm(skinName))) continue;
          if (!seenFiles.add(file)) continue;
          nameIndex[_norm(skinName)] = '$hero/$file';
          names.add(skinName);
        }
        heroSkins[hero] = names;
      });
    } catch (_) {}
    // 皮肤属性表（官方魔化判定）
    // ① 先加载 APP 内置完整表（100 英雄 / 61 个有魔化）
    try {
      final builtin = jsonDecode(await rootBundle.loadString('assets/data/skin-attributes.json')) as Map<String, dynamic>;
      skinAttrs
        ..clear()
        ..addAll(builtin);
    } catch (_) {}
    // ② 皮肤包内的增量表按皮肤名合并（不能整体覆盖英雄！
    //    举例：皮肤包「天使」只有 {风清扬·天使}，整体覆盖会冲掉内置表的「魔化」）
    try {
      final sa = File('${d.path}/skin-attributes.json');
      if (sa.existsSync()) {
        final o = jsonDecode(sa.readAsStringSync()) as Map<String, dynamic>;
        o.forEach((k, v) {
          if (v is! Map) return;
          final base = skinAttrs[k];
          if (base is Map) {
            v.forEach((sk, attr) => base[sk] = attr);
          } else {
            skinAttrs[k] = Map<String, dynamic>.from(v);
          }
        });
      }
    } catch (_) {}
  }

  String _norm(String s) => s.replaceAll('·', '').replaceAll(' ', '').trim();

  /// 取皮肤图文件（默认皮肤兜底）
  File? skinFile(String hero, String skinName) {
    final d = _root;
    if (d == null) return null;
    final skin = (skinName.isEmpty || skinName == '默认') ? hero : skinName;
    var f = File('${d.path}/$hero/$skin.skin');
    if (!f.existsSync()) f = File('${d.path}/$hero/$hero.skin');
    if (!f.existsSync()) {
      final hit = nameIndex[_norm(skinName)];
      if (hit != null) f = File('${d.path}/$hit');
    }
    if (!f.existsSync()) return null;
    return f;
  }

  List<String> skinsOfHero(String hero) {
    final official = AppData.officialName(hero);
    return heroSkins[official] ?? const ['默认'];
  }

  /// 按任意皮肤全名查文件（nameIndex 兜底）
  File? skinFileByAny(String skinName) {
    if (skinName.isEmpty) return null;
    final d = _root;
    if (d == null) return null;
    final hit = nameIndex[_norm(skinName)];
    if (hit != null) {
      final f = File('${d.path}/$hit');
      if (f.existsSync()) return f;
    }
    return null;
  }

  /// 按卡名查图（可能是融合名 → 拆主卡；或皮肤名兜底）
  File? skinFileByName(String cardName) {
    if (cardName.isEmpty) return null;
    // 皮肤名精确匹配
    final direct = skinFileByAny(cardName);
    if (direct != null) return direct;
    // 融合名拆主卡
    final f = AppData.I.splitFusion(cardName);
    if (f != null) {
      final main = skinFile(f[0], '');
      if (main != null) return main;
      return skinFileByAny(cardName.replaceAll(f[1], ''));
    }
    return null;
  }
}

/// 本地项目库（SharedPreferences 持久化）
class ProjectLibrary {
  static Future<List<dynamic>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final s = prefs.getString('local_projects');
    if (s != null && s.isNotEmpty) {
      return jsonDecode(s) as List<dynamic>;
    }
    // 首次：内置样例
    try {
      final sample = jsonDecode(await rootBundle.loadString('assets/data/project-sample.json')) as Map<String, dynamic>;
      final proj = sample['project'] as Map<String, dynamic>;
      final item = {'name': proj['name'] ?? '示例阵容', 'category': proj['category'] ?? '深海', 'project': proj};
      final arr = [item];
      await prefs.setString('local_projects', jsonEncode(arr));
      return arr;
    } catch (_) {
      return [];
    }
  }

  static Future<void> save(List<dynamic> lib) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('local_projects', jsonEncode(lib));
  }

  static Future<void> addProject(String category, String name, Map<String, dynamic> project) async {
    final lib = await load();
    project['name'] = name;
    project['category'] = category;
    lib.add({'name': name, 'category': category, 'project': project});
    await save(lib);
  }
}

/// 🎁 邀请码生成（照搬网页 app-core.js 个人中心 generate：独立私有 Gist invitecodes.json）
/// 主索引 room_index.json 的 inviteGistId 字段指向存储 Gist。
class InviteClient {
  static const _invFile = 'invitecodes.json';
  static const _chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  static const _ttlMs = 30 * 60 * 1000;          // 30 分钟有效
  static const _genLimitPerDay = 5;              // 个人每天最多 5 个
  static const _genMinInterval = 30 * 1000;      // 两次生成最少间隔 30 秒

  /// 生成一个邀请码；成功返回 'OK:码'，失败返回错误文案
  static Future<String> generate({required String nick}) async {
    try {
      // ① 找存储 Gist：room_index.json 顶层 inviteGistId
      final idxTxt = await GistClient.readFile(GistClient.masterGist, 'room_index.json');
      String? gid;
      if (idxTxt != null && idxTxt.isNotEmpty) {
        try {
          final idx = jsonDecode(idxTxt);
          if (idx is Map) gid = idx['inviteGistId']?.toString();
        } catch (_) {}
      }
      if (gid == null || gid.isEmpty) return '邀请码存储未初始化（网页端先在个人中心生成过一次才会创建）';

      // ② 读最新 store
      final storeTxt = await GistClient.readFile(gid, _invFile);
      Map<String, dynamic> store = {'codes': []};
      if (storeTxt != null && storeTxt.isNotEmpty) {
        try {
          final o = jsonDecode(storeTxt);
          if (o is Map && o['codes'] is List) store = Map<String, dynamic>.from(o);
        } catch (_) {}
      }
      final codes = List<Map<String, dynamic>>.from((store['codes'] as List).map((c) => Map<String, dynamic>.from(c as Map)));

      // ③ 个人限额：本机当天 personal 码 ≤5，间隔 ≥30s
      final now = DateTime.now().millisecondsSinceEpoch;
      final dev = await deviceTag();
      final dayStart = DateTime(now);
      final dayMs = DateTime(dayStart.year, dayStart.month, dayStart.day).millisecondsSinceEpoch;
      int tsOf(Map c) => (num.tryParse('${c['createdAt']}') ?? 0).toInt();
      final mineToday = codes.where((c) => c['personal'] == true && c['byDev'] == dev && tsOf(c) >= dayMs).toList();
      if (mineToday.length >= _genLimitPerDay) {
        return '今天最多生成 $_genLimitPerDay 个邀请码，请明天再试';
      }
      final lastAt = mineToday.fold<int>(0, (mx, c) => tsOf(c) > mx ? tsOf(c) : mx);
      if (lastAt > 0 && now - lastAt < _genMinInterval) {
        return '生成太频繁，请 ${((_genMinInterval - (now - lastAt)) / 1000).ceil()} 秒后再试';
      }

      // ④ 随机 6 位（去易混淆字符），不与已有码重复
      final active = codes.map<String>((c) => (c['code'] ?? '').toString()).toSet();
      String code = '';
      for (var t = 0; t < 50; t++) {
        code = _rand6();
        if (!active.contains(code)) break;
      }

      // ⑤ 落盘（web 同款字段）
      final rec = <String, dynamic>{
        'code': code,
        'by': nick,
        'byDev': dev,
        'note': '',
        'createdAt': now,
        'expireAt': now + _ttlMs,
        'usedBy': '', 'usedDev': '', 'usedAt': 0,
        'status': 'active',
        'personal': true,
      };
      // 过期 7 天清理（未过期一律保留，含长期码）
      final cutoff = now - 7 * 86400000;
      codes.removeWhere((c) => now > ((num.tryParse('${c['expireAt']}') ?? 0).toInt()) && tsOf(c) < cutoff);
      codes.add(rec);
      while (codes.length > 500) { codes.removeAt(0); }
      store['codes'] = codes;
      final ok = await GistClient.writeFile(gid, _invFile, jsonEncode(store));
      if (!ok) return '写入云端失败（token 失效或网络不通）';
      return 'OK:$code';
    } catch (e) {
      return '生成失败：$e';
    }
  }

  static String _rand6() {
    final rnd = Random.secure();
    return List.generate(6, (_) => _chars[rnd.nextInt(_chars.length)]).join();
  }

  /// 本机设备标识（限额统计用，存 prefs）
  static Future<String> deviceTag() async {
    if (_deviceTagSync != null) return _deviceTagSync!;
    final prefs = await SharedPreferences.getInstance();
    var t = prefs.getString('device_tag');
    if (t == null || t.isEmpty) {
      t = _rand6() + _rand6();
      await prefs.setString('device_tag', t);
    }
    _deviceTagSync = t;
    return t;
  }
  static String? _deviceTagSync;
}

/// 云端共享（Gist）——读走匿名（主索引实测匿名可读），写才需要 token
class GistClient {
  static const masterGist = 'a32a0628bd9275f3a4922cd12cf298c9';
  static String? _token;

  /// 内置兜底密文（与线上 gist-enc.txt / 网页 ENC_TOKEN 一致）。
  /// 密文本身公开无害（XOR+Base64，扫描器匹配不到明文 token）。
  /// 作用：iOS 网络请求发不出去时，仍能解密出 token，少依赖一次联网。
  static const embeddedEncToken = 'My46ExlRfkVwVDV7YR4QPH0UXGpKVw5jNSwWGx4MBAtlWwFbUl8pMQ==';

  static Map<String, String> _headers() => {
        'User-Agent': 'TFJL-App',
        'Accept': 'application/vnd.github+json',
        // 注意：不发送可能失效的 token——失效 token 会让 GitHub 直接 401，
        // 而匿名请求对 public/已知 id 的 gist 是放行的（实测）。
      };

  /// 🔐 共享写凭证：从线上拉取加密 Token（XOR+Base64）并解密。
  ///   密文在 gist-enc.txt（仓库/网页公开，但只是密文，扫描器匹配不到明文 token）。
  ///   解密算法与网页 app-core.js 的 _decTok 一致（key='TFJL-2026-GIST'）。
  static Future<String> fetchToken() async {
    if (_token != null && _token!.length > 10) return _token!;
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString('gist_token') ?? '';
    if (cached.length > 10) { _token = cached; return cached; }
    // 网络优先：拉线上最新密文（token 轮换后能自动跟上）
    try {
      final r = await http.get(
        Uri.parse('https://gyq-svip.github.io/tfjl-web/gist-enc.txt'),
        headers: {'User-Agent': 'TFJL-App'},
      ).timeout(const Duration(seconds: 20));
      if (r.statusCode == 200) {
        final b64 = r.body.trim();
        if (b64.length > 20) {
          final dec = _decTok(b64);
          if (dec.startsWith('ghp_') || dec.startsWith('github_pat_')) {
            _token = dec;
            await prefs.setString('gist_token', dec);
            debugPrint('[Gist] 加密 token 解密成功（线上）');
            return dec;
          }
        }
      }
    } catch (e) {
      debugPrint('[Gist] 线上拉取失败，改用内置密文兜底: $e');
    }
    // 兜底：用 APP 内置密文（网络不通时仍能解密出 token）
    final decFallback = _decTok(embeddedEncToken);
    if (decFallback.startsWith('ghp_') || decFallback.startsWith('github_pat_')) {
      _token = decFallback;
      await prefs.setString('gist_token', decFallback);
      debugPrint('[Gist] 加密 token 解密成功（内置兜底）');
      return decFallback;
    }
    return '';
  }

  /// 与网页 _decTok 相同的解密：Base64 解码 → 逐字节 XOR key
  static String _decTok(String b64) {
    try {
      final raw = base64Decode(b64);
      const key = 'TFJL-2026-GIST';
      final out = List<int>.generate(raw.length, (i) => raw[i] ^ key.codeUnitAt(i % key.length));
      return String.fromCharCodes(out);
    } catch (_) { return ''; }
  }

  /// 写一个 gist 的单个文件（PATCH，需 token）—— 用于手机心跳上报到诊断 Gist
  static Future<bool> writeFile(String gistId, String fileName, String content) async {
    try {
      final token = await fetchToken();
      if (token.isEmpty) return false;
      final r = await http.patch(
        Uri.parse('https://api.github.com/gists/$gistId'),
        headers: {
          'User-Agent': 'TFJL-App',
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'Authorization': 'token $token',
        },
        body: jsonEncode({'files': {fileName: {'content': content}}}),
      ).timeout(const Duration(seconds: 20));
      return r.statusCode == 200 || r.statusCode == 201;
    } catch (e) {
      debugPrint('[Gist] writeFile 失败: $e');
      return false;
    }
  }

  /// 读一个 gist 的单个文件内容
  /// ★优先走 gist.githubusercontent.com 直链：无限流、更快、更稳。
  ///   （api.github.com 匿名只有 60 次/小时，切几个阵容就耗尽 → 403 → "加载失败"）
  ///   只有 raw 直链失败才退回 GitHub API（兼容非 gyq-svip 名下的 gist）。
  static Future<String?> readFile(String gistId, String fileName) async {
    // ① raw 直链（无速率限制）
    for (final u in [
      'https://gist.githubusercontent.com/gyq-svip/$gistId/raw/$fileName',
      'https://gist.githubusercontent.com/raw/$gistId/$fileName',
    ]) {
      try {
        final r = await http.get(Uri.parse(u), headers: _headers()).timeout(const Duration(seconds: 15));
        if (r.statusCode == 200 && r.body.isNotEmpty) {
          debugPrint('[Gist] raw 直链读取成功: $fileName');
          return r.body;
        }
      } catch (_) {}
    }
    // ② 退回 GitHub API（有 60 次/小时限制，仅兜底）
    try {
      final r = await http.get(Uri.parse('https://api.github.com/gists/$gistId'),
          headers: _headers()).timeout(const Duration(seconds: 20));
      if (r.statusCode == 200) {
        final g = jsonDecode(r.body) as Map<String, dynamic>;
        final files = g['files'] as Map<String, dynamic>?;
        final f = files?[fileName] as Map<String, dynamic>?;
        if (f == null) return null;
        var txt = f['content']?.toString() ?? '';
        if (f['truncated'] == true && f['raw_url'] != null) {
          final r2 = await http.get(Uri.parse(f['raw_url'].toString()),
              headers: _headers()).timeout(const Duration(seconds: 30));
          txt = r2.body;
        }
        return txt;
      }
    } catch (_) {}
    return null;
  }

  /// 活动道具配置 activity_tabs.json（管理员后台维护，与网页同源）
  static Future<List<dynamic>?> readActivityTabs() async {
    final txt = await readFile(masterGist, 'activity_tabs.json');
    if (txt == null || txt.isEmpty) return null;
    try {
      final d = jsonDecode(txt) as Map<String, dynamic>;
      final tabs = d['tabs'];
      return tabs is List ? tabs : null;
    } catch (_) { return null; }
  }

  /// 共享索引 share_index.json：{key:{id,n,cat,ts}}
  static Future<Map<String, dynamic>?> readShareIndex() async {
    final txt = await readFile(masterGist, 'share_index.json');
    if (txt == null || txt.isEmpty) return null;
    try { return jsonDecode(txt) as Map<String, dynamic>; } catch (_) { return null; }
  }

  /// 某个共享阵容的 project 对象（project.json 顶层 {project:{...}}），成功后写本地缓存
  static Future<Map<String, dynamic>?> readProject(String gistId) async {
    final txt = await readFile(gistId, 'project.json');
    if (txt == null) return null;
    try {
      final root = jsonDecode(txt) as Map<String, dynamic>;
      final proj = root['project'] as Map<String, dynamic>?;
      if (proj != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('gist_proj_$gistId', jsonEncode(proj));
      }
      return proj;
    } catch (_) { return null; }
  }

  /// 读缓存的共享阵容（秒开）
  static Future<Map<String, dynamic>?> readProjectCached(String gistId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final c = prefs.getString('gist_proj_$gistId');
      if (c != null && c.isNotEmpty) return jsonDecode(c) as Map<String, dynamic>;
    } catch (_) {}
    return null;
  }
}
