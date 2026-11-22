import 'dart:ui' show Rect;
import 'package:shared_preferences/shared_preferences.dart';

/// 主页模块自由布局配置：每个模块有独立的 x/y/宽/高（相对屏幕比例 0~1）
/// 拖标题换位置、拖右下角缩放，像桌面窗口一样。
class LayoutConfig {
  static const moduleIds = ['myField', 'mateField', 'myHand', 'mateHand'];
  static const moduleNames = {
    'myField': '👤 我的卡组',
    'mateField': '🎭 队友卡组',
    'myHand': '📋 我的手牌',
    'mateHand': '📋 队友手牌',
  };

  /// 每个模块：x,y = 左上角相对画布比例；w,h = 宽高相对画布比例
  /// 默认四块：上排两个卡组、下排两个手牌（并排）
  final Map<String, Rect> rects = {
    'myField':   const Rect.fromLTWH(0.00, 0.00, 0.495, 0.42),
    'mateField': const Rect.fromLTWH(0.505, 0.00, 0.495, 0.42),
    'myHand':    const Rect.fromLTWH(0.00, 0.43, 0.495, 0.56),
    'mateHand':  const Rect.fromLTWH(0.505, 0.43, 0.495, 0.56),
  };

  static final LayoutConfig I = LayoutConfig._();
  LayoutConfig._();

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    for (final id in moduleIds) {
      final s = p.getString('layout_rect_$id');
      if (s != null && s.isNotEmpty) {
        try {
          final parts = s.split(',').map(double.parse).toList();
          if (parts.length == 4) {
            rects[id] = Rect.fromLTWH(parts[0], parts[1], parts[2], parts[3]);
          }
        } catch (_) {}
      }
    }
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    for (final id in moduleIds) {
      final r = rects[id]!;
      await p.setString('layout_rect_$id',
          '${r.left},${r.top},${r.width},${r.height}');
    }
  }

  Future<void> reset() async {
    rects['myField'] = const Rect.fromLTWH(0.00, 0.00, 0.495, 0.42);
    rects['mateField'] = const Rect.fromLTWH(0.505, 0.00, 0.495, 0.42);
    rects['myHand'] = const Rect.fromLTWH(0.00, 0.43, 0.495, 0.56);
    rects['mateHand'] = const Rect.fromLTWH(0.505, 0.43, 0.495, 0.56);
    await save();
  }

  /// 卡片缩放：模块被拉大 → 卡片跟着变大（宽高各占权重）
  double scaleOf(String id) {
    final r = rects[id]!;
    final wScale = r.width / 0.495;
    final hScale = r.height / (id.endsWith('Field') ? 0.42 : 0.56);
    return (wScale * 0.6 + hScale * 0.4).clamp(0.55, 2.4);
  }
}
