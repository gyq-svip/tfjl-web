import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

/// 🖼 主页背景（图片/视频）—— 类似网页版的背景设置
/// 存 prefs：app_bg_type(none/image/video) / app_bg_path(应用目录内副本) / app_bg_opacity(0.2~1)
class BgSetting {
  static const _typeKey = 'app_bg_type';
  static const _pathKey = 'app_bg_path';
  static const _opacityKey = 'app_bg_opacity';

  static String type = 'none';
  static String path = '';
  static double opacity = 0.5;

  static Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    type = p.getString(_typeKey) ?? 'none';
    path = p.getString(_pathKey) ?? '';
    opacity = p.getDouble(_opacityKey) ?? 0.5;
    if (path.isNotEmpty && !File(path).existsSync()) {
      type = 'none';   // 文件被清掉了，回退无背景
    }
  }

  static Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_typeKey, type);
    await p.setString(_pathKey, path);
    await p.setDouble(_opacityKey, opacity);
  }

  /// 选择文件后拷贝到应用目录（保证重启/清缓存后仍可用），返回新路径
  static Future<String?> copyIntoApp(String srcPath, String ext) async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final bgDir = Directory('${dir.path}/bg');
      if (!bgDir.existsSync()) bgDir.createSync(recursive: true);
      // 清旧文件
      for (final f in bgDir.listSync()) {
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
          try { f.deleteSync(); } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

/// 主页最底层背景层（IgnorePointer，不影响任何点击）
class BgLayer extends StatefulWidget {
  final String type;
  final String path;
  final double opacity;
  const BgLayer({super.key, required this.type, required this.path, required this.opacity});

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
    if (old.type != widget.type || old.path != widget.path) {
      _vc?.dispose();
      _vc = null;
      _init();
    }
  }

  Future<void> _init() async {
    if (widget.type != 'video' || widget.path.isEmpty) return;
    try {
      final f = File(widget.path);
      if (!f.existsSync()) return;
      final vc = VideoPlayerController.file(f);
      await vc.initialize();
      await vc.setLooping(true);
      await vc.setVolume(0);
      await vc.play();
      if (mounted) setState(() => _vc = vc);
    } catch (_) {}
  }

  @override
  void dispose() {
    _vc?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.type == 'none' || widget.path.isEmpty) return const SizedBox.shrink();
    Widget child;
    if (widget.type == 'image') {
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
