import 'dart:ui' show Rect;
import 'package:shared_preferences/shared_preferences.dart';

/// 主页模块自由布局：竖屏/横屏各存一套，互不干扰。
/// 每个模块 x/y/宽/高为相对画布比例 0~1。拖标题换位置、拖右下角缩放。
class LayoutConfig {
  static const moduleIds = ['myField', 'mateField', 'myHand', 'mateHand'];
  static const moduleNames = {
    'myField': '👤 我的卡组',
    'mateField': '🎭 队友卡组',
    'myHand': '📋 我的手牌',
    'mateHand': '📋 队友手牌',
  };

  /// 竖屏默认：上排两卡组、下排两手牌（并排）
  static Map<String, Rect> get portraitDefault => {
    'myField':   const Rect.fromLTWH(0.00, 0.00, 0.495, 0.42),
    'mateField': const Rect.fromLTWH(0.505, 0.00, 0.495, 0.42),
    'myHand':    const Rect.fromLTWH(0.00, 0.43, 0.495, 0.56),
    'mateHand':  const Rect.fromLTWH(0.505, 0.43, 0.495, 0.56),
  };

  /// 横屏默认：左半屏我方（卡组上+手牌下）、右半屏队友（卡组上+手牌下）
  static Map<String, Rect> get landscapeDefault => {
    'myField':   const Rect.fromLTWH(0.00, 0.00, 0.495, 0.48),
    'myHand':    const Rect.fromLTWH(0.00, 0.49, 0.495, 0.51),
    'mateField': const Rect.fromLTWH(0.505, 0.00, 0.495, 0.48),
    'mateHand':  const Rect.fromLTWH(0.505, 0.49, 0.495, 0.51),
  };

  late Map<String, Rect> portrait;
  late Map<String, Rect> landscape;

  static final LayoutConfig I = LayoutConfig._();
  LayoutConfig._() {
    portrait = Map.from(portraitDefault);
    landscape = Map.from(landscapeDefault);
  }

  /// 当前方向的配置（由调用方传入 isLandscape）
  Map<String, Rect> current(bool isLandscape) => isLandscape ? landscape : portrait;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    portrait = await _loadSet(p, 'v');
    landscape = await _loadSet(p, 'h');
  }

  Future<Map<String, Rect>> _loadSet(SharedPreferences p, String suffix) async {
    final result = Map<String, Rect>.from(suffix == 'v' ? portraitDefault : landscapeDefault);
    for (final id in moduleIds) {
      final s = p.getString('layout_rect_${id}_$suffix');
      if (s != null && s.isNotEmpty) {
        try {
          final parts = s.split(',').map(double.parse).toList();
          if (parts.length == 4) result[id] = Rect.fromLTWH(parts[0], parts[1], parts[2], parts[3]);
        } catch (_) {}
      }
    }
    return result;
  }

  Future<void> save(bool isLandscape) async {
    final p = await SharedPreferences.getInstance();
    final suffix = isLandscape ? 'h' : 'v';
    final set = isLandscape ? landscape : portrait;
    for (final id in moduleIds) {
      final r = set[id]!;
      await p.setString('layout_rect_${id}_$suffix', '${r.left},${r.top},${r.width},${r.height}');
    }
  }

  Future<void> reset(bool isLandscape) async {
    if (isLandscape) {
      landscape = Map.from(landscapeDefault);
    } else {
      portrait = Map.from(portraitDefault);
    }
    await save(isLandscape);
  }
}
