import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🎚 全局「界面透明度」（0 = 全透明，能完整看到主题视频；1 = 完全不透明）
/// 只作用于面板/弹窗/卡片等背景色，文字与卡图保持清晰。
class UiAlpha {
  static const _key = 'app_ui_alpha';
  static const double defaultValue = 0.35;

  /// 0.0 ~ 1.0；改动后通过 notifier 通知整棵 UI 重建
  static final ValueNotifier<double> notifier = ValueNotifier<double>(defaultValue);

  static double get value => notifier.value;

  static Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final v = p.getDouble(_key);
    notifier.value = (v ?? defaultValue).clamp(0.0, 1.0);
  }

  static Future<void> set(double v) async {
    final nv = v.clamp(0.0, 1.0);
    notifier.value = nv;
    final p = await SharedPreferences.getInstance();
    await p.setDouble(_key, nv);
  }

  /// 把面板背景色按全局透明度处理；factor 可给输入框等需要稍实一点的面板加成
  static Color bg(Color base, [double factor = 1.0]) =>
      base.withOpacity((base.opacity * value * factor).clamp(0.0, 1.0));

  /// 已经是半透明白/黑叠层时，用这个按同样比例缩放
  static Color tint(Color base, [double factor = 1.0]) => bg(base, factor);
}
