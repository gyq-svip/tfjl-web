import 'package:shared_preferences/shared_preferences.dart';

/// 主页模块布局配置：顺序 + 每块大小档位
/// 4 个模块固定 id，用户可拖动排序、切换大小（0小/1中/2大）
class LayoutConfig {
  static const moduleIds = ['myField', 'mateField', 'myHand', 'mateHand'];
  static const moduleNames = {
    'myField': '👤 我的卡组',
    'mateField': '🎭 队友卡组',
    'myHand': '📋 我的手牌',
    'mateHand': '📋 队友手牌',
  };
  // 大小档位对应的卡片缩放（相对基准）
  static const scales = [1.0, 1.22, 1.45];

  List<String> order = List.from(moduleIds);
  Map<String, int> sizes = {for (final id in moduleIds) id: 1};

  static final LayoutConfig I = LayoutConfig._();
  LayoutConfig._();

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final savedOrder = p.getStringList('layout_order');
    if (savedOrder != null && savedOrder.length == moduleIds.length &&
        moduleIds.every(savedOrder.contains)) {
      order = savedOrder;
    }
    for (final id in moduleIds) {
      sizes[id] = p.getInt('layout_size_$id') ?? 1;
    }
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setStringList('layout_order', order);
    for (final id in moduleIds) {
      await p.setInt('layout_size_$id', sizes[id] ?? 1);
    }
  }

  int nextSize(String id) {
    final cur = sizes[id] ?? 1;
    final next = (cur + 1) % scales.length;
    sizes[id] = next;
    save();
    return next;
  }

  double scaleOf(String id) => scales[sizes[id] ?? 1];
}
