import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// 🌐 全局默认配置：卡池设一次 → 精选 / 活动 / 大航海 / 主页都默认沿用。
/// 个别阵容仍可在本地单独覆盖（勾选取消即可）。
class GlobalCfg {
  static const _key = 'tfjl_global_defaults_v1';

  /// 卡皮肤/等级/魔化/融合 应用到所有阵容
  static bool cardApplyAll = false;
  /// 精选战车/减伤表 应用到所有精选阵容
  static bool featApplyAll = false;
  /// 活动战车/减伤表 应用到全部活动天数
  static bool actApplyAll = false;

  /// scope: feat / act；side key: a / b
  static final Map<String, dynamic> feat = {};
  static final Map<String, dynamic> act = {};

  static Map<String, dynamic> sideCfg(String scope, bool isMine) {
    final scopeMap = scope == 'act' ? act : feat;
    final c = scopeMap[isMine ? 'a' : 'b'];
    if (c is! Map) return {};
    return Map<String, dynamic>.from(c);
  }

  static Future<void> setSideCfg(String scope, bool isMine, Map<String, dynamic> cfg) async {
    final scopeMap = scope == 'act' ? act : feat;
    scopeMap[isMine ? 'a' : 'b'] = cfg;
    await save();
  }

  static Future<void> setApplyAll(String scope, bool v) async {
    if (scope == 'act') actApplyAll = v;
    else featApplyAll = v;
    await save();
  }

  static Future<void> setCardApplyAll(bool v) async {
    cardApplyAll = v;
    await save();
  }

  static Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final t = p.getString(_key);
      if (t == null || t.isEmpty) return;
      final j = jsonDecode(t) as Map<String, dynamic>;
      cardApplyAll = j['cardApplyAll'] == true;
      featApplyAll = j['featApplyAll'] == true;
      actApplyAll = j['actApplyAll'] == true;
      feat.clear();
      act.clear();
      if (j['feat'] is Map) feat.addAll(Map<String, dynamic>.from(j['feat'] as Map));
      if (j['act'] is Map) act.addAll(Map<String, dynamic>.from(j['act'] as Map));
    } catch (_) {}
  }

  static Future<void> save() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_key, jsonEncode({
        'cardApplyAll': cardApplyAll,
        'featApplyAll': featApplyAll,
        'actApplyAll': actApplyAll,
        'feat': feat,
        'act': act,
      }));
    } catch (_) {}
  }
}
