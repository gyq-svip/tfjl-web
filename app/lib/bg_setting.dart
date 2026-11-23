import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

/// 🖼 主页背景（内置主题视频 / 本地图片 / 本地视频）
/// 存 prefs：app_bg_type(none/image/video/theme) / app_bg_path / app_bg_theme / app_bg_opacity
/// 默认（从未设置过）= 内置主题「伽罗」，与 PC 端 bg-themes 清单的 defaultBg(bvid:tmvtdwbxi1imx) 一致
class BgSetting {
  static const _typeKey = 'app_bg_type';
  static const _pathKey = 'app_bg_path';
  static const _opacityKey = 'app_bg_opacity';
  static const _themeKey = 'app_bg_theme';

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

  static String type = 'theme';          // none / image / video / theme
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
    await p.setString(_typeKey, type);
    await p.setString(_pathKey, path);
    await p.setString(_themeKey, themeId);
    await p.setDouble(_opacityKey, opacity);
  }

  /// 内置主题缓存文件（Documents/bg/theme_<id>.mp4）
  static Future<File> themeCacheFile(String id) async {
    final dir = await getApplicationDocumentsDirectory();
    final bgDir = Directory('${dir.path}/bg');
    if (!bgDir.existsSync()) bgDir.createSync(recursive: true);
    return File('${bgDir.path}/theme_$id.mp4');
  }

  static bool _downloading = false;

  /// 后台下载内置主题视频到本地缓存（下次启动秒开、省流量）。失败静默。
  static Future<void> ensureThemeCached(String id, String url) async {
    if (_downloading) return;
    try {
      final f = await themeCacheFile(id);
      if (f.existsSync() && f.lengthSync() > 500 * 1024) return;   // 已缓存
      _downloading = true;
      final tmp = File('${f.path}.part');
      final client = http.Client();
      final req = http.Request('GET', Uri.parse(url));
      req.headers['User-Agent'] =
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
      req.followRedirects = true;
      req.maxRedirects = 6;
      final resp = await client.send(req).timeout(const Duration(seconds: 30));
      if (resp.statusCode != 200) { client.close(); _downloading = false; return; }
      final sink = tmp.openSync(mode: FileMode.write);
      await for (final chunk in resp.stream) {
        sink.writeFromSync(chunk);
      }
      sink.flushSync();
      sink.closeSync();
      client.close();
      if (tmp.lengthSync() > 500 * 1024) {
        if (f.existsSync()) f.deleteSync();
        tmp.renameSync(f.path);
        debugPrint('[BgTheme] 已缓存 ${f.path} (${(f.lengthSync() / 1048576).toStringAsFixed(1)}MB)');
      }
    } catch (e) {
      debugPrint('[BgTheme] 缓存失败: $e');
    } finally {
      _downloading = false;
    }
  }

  /// 选择文件后拷贝到应用目录（保证重启/清缓存后仍可用），返回新路径
  static Future<String?> copyIntoApp(String srcPath, String ext) async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final bgDir = Directory('${dir.path}/bg');
      if (!bgDir.existsSync()) bgDir.createSync(recursive: true);
      // 只清用户自定义文件（保留 theme_* 内置视频缓存）
      for (final f in bgDir.listSync()) {
        if (f.path.contains('theme_')) continue;
        try { f.deleteSync(); } catch (_) {}
      }
      final dst = '${bgDir.path}/bg_${DateTime.now().millisecondsSinceEpoch}.$ext';
      await File(srcPath).copy(dst);
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
    if (type == 'theme') return '内置主题：${themeName(themeId)} · 透明度 ${(opacity * 100).round()}%';
    if (type == 'image') return '图片背景 · 透明度 ${(opacity * 100).round()}%';
    if (type == 'video') return '视频背景 · 透明度 ${(opacity * 100).round()}%';
    return '未开启';
  }

  static String get shortLabel {
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
  const BgLayer({
    super.key,
    required this.type,
    required this.path,
    this.themeId = BgSetting.defaultThemeId,
    required this.opacity,
  });

  @override
  State<BgLayer> createState() => _BgLayerState();
}

class _BgLayerState extends State<BgLayer> {
  VideoPlayerController? _vc;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void didUpdateWidget(covariant BgLayer old) {
    super.didUpdateWidget(old);
    if (old.type != widget.type || old.path != widget.path || old.themeId != widget.themeId) {
      _vc?.dispose();
      _vc = null;
      _init();
    }
  }

  Future<void> _init() async {
    try {
      if (widget.type == 'video') {
        if (widget.path.isEmpty) return;
        final f = File(widget.path);
        if (!f.existsSync()) return;
        await _play(VideoPlayerController.file(f));
      } else if (widget.type == 'theme') {
        final theme = BgSetting.themeById(widget.themeId);
        final id = theme['id']!;
        final url = theme['url']!;
        final cache = await BgSetting.themeCacheFile(id);
        if (cache.existsSync() && cache.lengthSync() > 500 * 1024) {
          await _play(VideoPlayerController.file(cache));   // 本地缓存秒开
        } else {
          // 未缓存：先网络流式播放（立即有画面），同时后台下载缓存
          await _play(VideoPlayerController.networkUrl(Uri.parse(url)));
          BgSetting.ensureThemeCached(id, url);
        }
      }
    } catch (e) {
      debugPrint('[BgLayer] 初始化失败: $e');
    }
  }

  Future<void> _play(VideoPlayerController vc) async {
    await vc.initialize();
    await vc.setLooping(true);
    await vc.setVolume(0);
    await vc.play();
    if (mounted) {
      setState(() => _vc = vc);
    } else {
      vc.dispose();
    }
  }

  @override
  void dispose() {
    _vc?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.type == 'none') return const SizedBox.shrink();
    Widget child;
    if (widget.type == 'image') {
      if (widget.path.isEmpty) return const SizedBox.shrink();
      child = Image.file(File(widget.path), fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const SizedBox.shrink());
    } else {
      final vc = _vc;
      if (vc == null || !vc.value.isInitialized) return const SizedBox.shrink();
      final s = vc.value.size;
      child = ClipRect(
        child: FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(width: s.width, height: s.height, child: VideoPlayer(vc)),
        ),
      );
    }
    return IgnorePointer(
      child: Opacity(opacity: widget.opacity, child: SizedBox.expand(child: child)),
    );
  }
}
