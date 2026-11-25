import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

/// 🖼 主页背景（内置主题视频 / 本地图片 / 本地视频）
/// 存 prefs：app_bg_enabled / app_bg_type(none/image/video/theme) / app_bg_path / app_bg_theme / app_bg_opacity
/// 默认（从未设置过）= 内置主题「伽罗」，与 PC 端 bg-themes 清单的 defaultBg(bvid:tmvtdwbxi1imx) 一致
/// 🔴 内置主题只会下载一次（落到本地 bg/theme_<id>.mp4），之后永远本地播放，不再走流量
class BgSetting {
  static const _enabledKey = 'app_bg_enabled';
  static const _typeKey = 'app_bg_type';
  static const _pathKey = 'app_bg_path';
  static const _opacityKey = 'app_bg_opacity';
  static const _themeKey = 'app_bg_theme';
  static const _soundKey = 'app_bg_sound';
  // v1.8.9 起声音默认开启；老用户只迁移一次，之后尊重手动开关
  static const _soundMigratedKey = 'app_bg_sound_default_on_v189';

  /// 内置视频主题（与 PC 端同源：Gitee bg-themes 发行版）
  static const builtinThemes = <Map<String, String>>[
    {
      'id': 'tmvtdwbxi1imx',
      'name': '伽罗',
      'url': 'https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/bg-themes/tmvtdwbxi1imx.mp4',
    },
    {
      'id': 'tmvsnoclihw09',
      'name': 'A2',
      'url': 'https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/bg-themes/tmvsnoclihw09.mp4',
    },
    {
      'id': 'tmvtlmldzvyta',
      'name': 'A1',
      'url': 'https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/bg-themes/tmvtlmldzvyta.mp4',
    },
  ];

  /// PC 端清单里的 defaultBg = bvid:tmvtdwbxi1imx（伽罗）
  static const defaultThemeId = 'tmvtdwbxi1imx';

  static bool enabled = true;             // 总开关（不喜欢背景的可以关）
  static bool soundOn = true;             // 背景视频声音（v1.8.9 起默认开启，可关）
  static String type = 'theme';           // none / image / video / theme
  static String path = '';
  static String themeId = defaultThemeId;
  static double opacity = 0.5;

  static Map<String, String> themeById(String id) => builtinThemes.firstWhere(
        (t) => t['id'] == id,
        orElse: () => builtinThemes.first,
      );

  static String themeName(String id) => themeById(id)['name'] ?? '';

  static Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    enabled = p.getBool(_enabledKey) ?? true;
    // 🔴 老版本默认是静音；升级到 1.8.9 只迁移一次为「有声」，用户之后手动关掉不会被覆盖
    final soundMigrated = p.getBool(_soundMigratedKey) ?? false;
    if (!soundMigrated) {
      soundOn = true;
      await p.setBool(_soundKey, true);
      await p.setBool(_soundMigratedKey, true);
    } else {
      soundOn = p.getBool(_soundKey) ?? true;
    }
    final savedType = p.getString(_typeKey);
    path = p.getString(_pathKey) ?? '';
    themeId = p.getString(_themeKey) ?? defaultThemeId;
    opacity = p.getDouble(_opacityKey) ?? 0.5;
    // 从未设置过 → 默认内置主题（伽罗），开箱就有背景
    type = (savedType == null || savedType.isEmpty) ? 'theme' : savedType;
    if (type == 'image' || type == 'video') {
      if (path.isEmpty || !File(path).existsSync()) type = 'none';
    }
    if (type == 'theme' && !builtinThemes.any((t) => t['id'] == themeId)) {
      themeId = defaultThemeId;
    }
  }

  static Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_enabledKey, enabled);
    await p.setBool(_soundKey, soundOn);
    await p.setBool(_soundMigratedKey, true);
    await p.setString(_typeKey, type);
    await p.setString(_pathKey, path);
    await p.setString(_themeKey, themeId);
    await p.setDouble(_opacityKey, opacity);
  }

  static Future<void> setEnabled(bool v) async {
    enabled = v;
    await save();
  }

  static Future<void> setSound(bool v) async {
    soundOn = v;
    await save();
  }

  /// 内置主题缓存文件（Documents/bg/theme_<id>.mp4）
  static Future<File> themeCacheFile(String id) async {
    final dir = await getApplicationDocumentsDirectory();
    final bgDir = Directory('${dir.path}/bg');
    if (!bgDir.existsSync()) bgDir.createSync(recursive: true);
    return File('${bgDir.path}/theme_$id.mp4');
  }

  /// 本地是否已有缓存
  static Future<bool> isThemeCached(String id) async {
    try {
      final f = await themeCacheFile(id);
      return f.existsSync() && f.lengthSync() > 500 * 1024;
    } catch (_) {
      return false;
    }
  }

  static final Set<String> _downloading = {};
  static void Function(String id, double pct)? onDownloadProgress;

  /// 下载内置主题视频到本地（只下一次）。返回是否成功。已有缓存直接返回 true。
  static Future<bool> ensureThemeCached(String id, String url) async {
    try {
      final f = await themeCacheFile(id);
      if (f.existsSync() && f.lengthSync() > 500 * 1024) return true;   // 已缓存
      if (_downloading.contains(id)) return false;                     // 正在下，别并发
      _downloading.add(id);
      final tmp = File('${f.path}.part');
      final client = http.Client();
      final req = http.Request('GET', Uri.parse(url));
      req.headers['User-Agent'] =
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
      req.followRedirects = true;
      req.maxRedirects = 6;
      final resp = await client.send(req).timeout(const Duration(seconds: 30));
      if (resp.statusCode != 200) {
        client.close();
        _downloading.remove(id);
        debugPrint('[BgTheme] HTTP ${resp.statusCode}');
        return false;
      }
      final total = resp.contentLength ?? 0;
      final sink = tmp.openSync(mode: FileMode.write);
      var received = 0;
      await for (final chunk in resp.stream) {
        sink.writeFromSync(chunk);
        received += chunk.length;
        if (total > 0) onDownloadProgress?.call(id, received / total);
      }
      sink.flushSync();
      sink.closeSync();
      client.close();
      _downloading.remove(id);
      if (tmp.lengthSync() > 500 * 1024) {
        if (f.existsSync()) f.deleteSync();
        tmp.renameSync(f.path);
        debugPrint('[BgTheme] 缓存完成 ${f.path} (${(f.lengthSync() / 1048576).toStringAsFixed(1)}MB)');
        return true;
      }
      return false;
    } catch (e) {
      _downloading.remove(id);
      debugPrint('[BgTheme] 下载失败: $e');
      return false;
    }
  }

  static Future<Directory?> _prepareBgDir() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final bgDir = Directory('${dir.path}/bg');
      if (!bgDir.existsSync()) bgDir.createSync(recursive: true);
      // 只清用户自定义文件（保留 theme_* 内置视频缓存）
      for (final f in bgDir.listSync()) {
        if (f.path.contains('theme_')) continue;
        try { f.deleteSync(); } catch (_) {}
      }
      return bgDir;
    } catch (_) {
      return null;
    }
  }

  /// 选择文件后拷贝到应用目录（保证重启/清缓存后仍可用），返回新路径
  static Future<String?> copyIntoApp(String srcPath, String ext) async {
    try {
      final bgDir = await _prepareBgDir();
      if (bgDir == null) return null;
      final dst = '${bgDir.path}/bg_${DateTime.now().millisecondsSinceEpoch}.$ext';
      await File(srcPath).copy(dst);
      return dst;
    } catch (_) {
      return null;
    }
  }

  /// 安卓相册/云盘有时只给 content:// 流、没有真实路径：直接写流兜底
  static Future<String?> copyStreamIntoApp(Stream<List<int>> stream, String ext) async {
    try {
      final bgDir = await _prepareBgDir();
      if (bgDir == null) return null;
      final dst = '${bgDir.path}/bg_${DateTime.now().millisecondsSinceEpoch}.$ext';
      final sink = File(dst).openWrite();
      await stream.pipe(sink);
      return dst;
    } catch (_) {
      return null;
    }
  }

  static Future<void> clear() async {
    type = 'none';
    path = '';
    await save();
    try {
      final dir = await getApplicationDocumentsDirectory();
      final bgDir = Directory('${dir.path}/bg');
      if (bgDir.existsSync()) {
        for (final f in bgDir.listSync()) {
          if (f.path.contains('theme_')) continue;   // 内置缓存留着，切回来即用
          try { f.deleteSync(); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  /// 设置页显示的一行说明
  static String get summary {
    if (!enabled) return '已关闭（主页不显示背景）';
    if (type == 'theme') return '内置主题：${themeName(themeId)} · 透明度 ${(opacity * 100).round()}%';
    if (type == 'image') return '图片背景 · 透明度 ${(opacity * 100).round()}%';
    if (type == 'video') return '视频背景 · 透明度 ${(opacity * 100).round()}%';
    return '未开启';
  }

  static String get shortLabel {
    if (!enabled) return '关';
    if (type == 'theme') return themeName(themeId);
    if (type == 'image') return '图片';
    if (type == 'video') return '视频';
    return '无';
  }
}

/// 主页最底层背景层（IgnorePointer，不影响任何点击）
class BgLayer extends StatefulWidget {
  final String type;
  final String path;
  final String themeId;
  final double opacity;
  final bool sound;
  final bool enabled;
  const BgLayer({
    super.key,
    required this.type,
    required this.path,
    this.themeId = BgSetting.defaultThemeId,
    required this.opacity,
    this.sound = false,
    this.enabled = true,
  });

  @override
  State<BgLayer> createState() => _BgLayerState();
}

class _BgLayerState extends State<BgLayer> with WidgetsBindingObserver {
  VideoPlayerController? _vc;
  bool _preparing = false;          // 首次下载/初始化中
  double _pct = 0;
  int _gen = 0;                     // 播放器代次：异步初始化回来后丢弃过期实例，防止叠加播放
  bool _lifePaused = false;         // App 退后台时暂停，避免只留声音+内存堆积

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.detached) {
      _lifePaused = true;
      try { _vc?.pause(); } catch (_) {}
    } else if (state == AppLifecycleState.resumed) {
      _lifePaused = false;
      if (widget.enabled && !_lifePaused) {
        try { _vc?.play(); } catch (_) {}
      }
    }
  }

  void _disposeVc() {
    _gen++;
    final vc = _vc;
    _vc = null;
    try { vc?.pause(); } catch (_) {}
    try { vc?.dispose(); } catch (_) {}
  }

  @override
  void didUpdateWidget(covariant BgLayer old) {
    super.didUpdateWidget(old);
    if (old.type != widget.type || old.path != widget.path || old.themeId != widget.themeId) {
      _disposeVc();
      _init();
    } else if (old.sound != widget.sound) {
      _vc?.setVolume(widget.sound ? 0.6 : 0);   // 只调音量，不重播
    }
    // 🔴 背景总开关：关掉时必须停止播放并释放（否则画面没了声音还在响）
    if (old.enabled != widget.enabled) {
      if (!widget.enabled) {
        _disposeVc();
        if (mounted) setState(() { _preparing = false; });
      } else {
        _init();
      }
    }
  }

  Future<void> _init() async {
    final gen = ++_gen;   // 每次初始化升代，过期异步结果直接丢弃
    try {
      if (!widget.enabled || widget.type == 'none') return;
      if (widget.type == 'video') {
        if (widget.path.isEmpty) return;
        final f = File(widget.path);
        if (!f.existsSync()) return;
        await _play(VideoPlayerController.file(f), gen);
        return;
      }
      if (widget.type != 'theme') return;

      final theme = BgSetting.themeById(widget.themeId);
      final id = theme['id']!;
      final url = theme['url']!;
      final cache = await BgSetting.themeCacheFile(id);
      if (!mounted || gen != _gen || !widget.enabled) return;
      // ① 已有本地缓存 → 直接播（永不耗流量）
      if (cache.existsSync() && cache.lengthSync() > 500 * 1024) {
        await _play(VideoPlayerController.file(cache), gen);
        return;
      }
      // ② 首次：先下载完再播（只下载一次），期间显示小提示
      if (mounted) setState(() { _preparing = true; _pct = 0; });
      BgSetting.onDownloadProgress = (tid, p) {
        if (tid == id && mounted && gen == _gen) setState(() => _pct = p);
      };
      final ok = await BgSetting.ensureThemeCached(id, url);
      if (gen == _gen) BgSetting.onDownloadProgress = null;
      if (!mounted || gen != _gen) return;
      setState(() => _preparing = false);
      if (!widget.enabled) return;   // 下载期间用户关了背景 → 不播
      if (ok && cache.existsSync()) {
        await _play(VideoPlayerController.file(cache), gen);
      }
    } catch (e) {
      debugPrint('[BgLayer] 初始化失败: $e');
      if (mounted && gen == _gen) setState(() { _preparing = false; });
    }
  }

  Future<void> _play(VideoPlayerController vc, int gen) async {
    if (!widget.enabled || gen != _gen) { vc.dispose(); return; }
    try {
      await vc.initialize();
      if (!widget.enabled || gen != _gen || !mounted) { vc.dispose(); return; }
      await vc.setLooping(true);
      await vc.setVolume(widget.sound ? 0.6 : 0);
      await vc.play();
      if (!mounted || gen != _gen) { vc.dispose(); return; }
      // 换播放器前释放旧的，避免两个 native player 同时占内存
      final old = _vc;
      _vc = vc;
      try { old?.pause(); } catch (_) {}
      try { old?.dispose(); } catch (_) {}
      if (_lifePaused) {
        try { vc.pause(); } catch (_) {}
      }
      setState(() {});
    } catch (e) {
      debugPrint('[BgLayer] 播放失败: $e');
      vc.dispose();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _disposeVc();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled || widget.type == 'none') return const SizedBox.shrink();
    Widget child;
    if (widget.type == 'image') {
      if (widget.path.isEmpty) return const SizedBox.shrink();
      child = Image.file(File(widget.path), fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const SizedBox.shrink());
    } else {
      final vc = _vc;
      if (vc == null || !vc.value.isInitialized) {
        // 首次使用正在下载内置视频：右下角小提示（不打扰、不影响点击）
        if (_preparing) {
          return IgnorePointer(
            child: Align(
              alignment: Alignment.bottomRight,
              child: Padding(
                padding: const EdgeInsets.only(right: 10, bottom: 58),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xCC0C0C17),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    _pct > 0 ? '背景下载中 ${(_pct * 100).toStringAsFixed(0)}%' : '背景下载中…',
                    style: const TextStyle(fontSize: 9.5, color: Color(0xFF8A96AC)),
                  ),
                ),
              ),
            ),
          );
        }
        return const SizedBox.shrink();
      }
      final s = vc.value.size;
      child = ClipRect(
        child: FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(width: s.width, height: s.height, child: VideoPlayer(vc)),
        ),
      );
    }
    // 🔴 安卓部分机型对 Texture(VideoPlayer) 套 Opacity 会渲染成黑屏；
    // 改成视频保持不透明、上面盖一层黑色遮罩来调暗，iOS/安卓都稳定。
    final dim = (1 - widget.opacity).clamp(0.0, 1.0);
    return IgnorePointer(
      child: Stack(fit: StackFit.expand, children: [
        SizedBox.expand(child: child),
        if (dim > 0.001) ColoredBox(color: Colors.black.withAlpha((dim * 255).round())),
      ]),
    );
  }
}
