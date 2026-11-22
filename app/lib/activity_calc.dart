import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'data_store.dart';

/// 活动计算器 —— 照搬网页 app-features.js 的 ACTIVITY_TABS_DEFAULT + 
/// loadActivityTabs（云端覆盖）+ calcOptimalPurchase（动态规划最优购买）。
/// 手机端只读：商品从管理员后台 activity_tabs.json 读，本地内置默认兜底。
class ActivityCalc {
  static const _cacheKey = 'activity_tabs_cache';

  /// 3个活动的内置默认（与网页 ACTIVITY_TABS_DEFAULT 一致）
  static final List<Map<String, dynamic>> defaults = [
    {
      'id': 'beixiang', 'name': '活动对战杯', 'title': '第四话·丐帮 · 活动对战杯',
      'icon': '🆕', 'noParams': true,
      'days': 23,
      'items': [
        {'name': '卷帘大将·斧客', 'cost': 480}, {'name': '小白龙·剑客', 'cost': 480},
        {'name': '电容器', 'cost': 480}, {'name': '富甲天下号', 'cost': 480},
        {'name': '银河之光', 'cost': 480}, {'name': '走马江湖号', 'cost': 480},
        {'name': '泰山掌门·闪', 'cost': 640}, {'name': '衡山掌门点骨弓', 'cost': 640},
        {'name': '一指名医·死神', 'cost': 640}, {'name': '狮王争霸号', 'cost': 720},
        {'name': '花果神山号', 'cost': 720}, {'name': '魔化·火灵', 'cost': 960},
        {'name': '风暴·小炮', 'cost': 1280}, {'name': '风清扬·天使', 'cost': 1280},
        {'name': '随机龙珠', 'cost': 1600},
      ],
    },
    {
      'id': 'old', 'name': '旧活动', 'title': '', 'icon': '📦',
      'days': 21,
      'items': [
        {'name': '巨灵神·海妖', 'cost': 480}, {'name': '金银法王·恶匪', 'cost': 480},
        {'name': '电容器', 'cost': 480}, {'name': '山河社稷号', 'cost': 480},
        {'name': '寂静之月号', 'cost': 480}, {'name': '浴火凤凰号', 'cost': 480},
        {'name': '神剑山庄号', 'cost': 480}, {'name': '飞龙在天号', 'cost': 720},
        {'name': '金卡x1', 'cost': 20}, {'name': '如霜·女王', 'cost': 960},
        {'name': '博达尔多·后羿', 'cost': 960}, {'name': '风暴·战将', 'cost': 960},
        {'name': '魔化·天使', 'cost': 960}, {'name': '夏大叔·龟相', 'cost': 1280},
        {'name': '随机金色龙珠', 'cost': 1080}, {'name': '随机红色龙珠', 'cost': 1600},
      ],
    },
    {
      'id': 'shop', 'name': '状元商店', 'title': '', 'icon': '🏪',
      'days': 21,
      'items': [
        {'name': '巨灵神·海妖', 'cost': 480}, {'name': '金银法王·恶匪', 'cost': 480},
        {'name': '电容器', 'cost': 480}, {'name': '山河社稷号', 'cost': 480},
        {'name': '寂静之月号', 'cost': 480}, {'name': '浴火凤凰号', 'cost': 480},
        {'name': '神剑山庄号', 'cost': 480}, {'name': '飞龙在天号', 'cost': 720},
        {'name': '金卡x1', 'cost': 20}, {'name': '如霜·女王', 'cost': 960},
        {'name': '博达尔多·后羿', 'cost': 960}, {'name': '风暴·战将', 'cost': 960},
        {'name': '魔化·天使', 'cost': 960}, {'name': '夏大叔·龟相', 'cost': 1280},
        {'name': '随机金色龙珠', 'cost': 1080}, {'name': '随机红色龙珠', 'cost': 1600},
      ],
    },
  ];

  List<Map<String, dynamic>> _tabs = List.from(defaults);
  List<Map<String, dynamic>> get tabs => _tabs;

  /// 加载配置：缓存秒开 → 后台拉云端覆盖（云端优先、默认兜底合并）
  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_cacheKey);
    if (cached != null && cached.isNotEmpty) {
      try { _tabs = _parse(jsonDecode(cached) as List<dynamic>); } catch (_) {}
    }
    final remote = await GistClient.readActivityTabs();
    if (remote != null && remote.isNotEmpty) {
      _tabs = _parse(remote);
      await prefs.setString(_cacheKey, jsonEncode(_tabs));
    }
  }

  List<Map<String, dynamic>> _parse(List<dynamic> remote) {
    final result = <Map<String, dynamic>>[];
    for (final t in remote) {
      if (t is! Map<String, dynamic>) continue;
      final id = (t['id'] ?? '').toString();
      final def = defaults.firstWhere((d) => d['id'] == id, orElse: () => {});
      final itemsRaw = t['items'];
      final items = (itemsRaw is List && itemsRaw.isNotEmpty)
          ? itemsRaw.map((e) => {'name': (e['name'] ?? '').toString(), 'cost': int.tryParse(e['cost']?.toString() ?? '') ?? 0}).toList()
          : def['items'];
      result.add({
        'id': id.isNotEmpty ? id : (def['id'] ?? id),
        'name': (t['name'] ?? def['name'] ?? '未命名').toString(),
        'title': (t['title'] ?? def['title'] ?? '').toString(),
        'icon': (t['icon'] ?? def['icon'] ?? '🎁').toString(),
        'days': int.tryParse((t['params']?['days'] ?? t['days'] ?? def['days'] ?? 21).toString()) ?? 21,
        'items': items,
      });
    }
    // 云端缺的 tab 用默认补
    for (final d in defaults) {
      if (!result.any((t) => t['id'] == d['id'])) result.add(Map.from(d));
    }
    return result;
  }

  /// 动态规划最优购买方案（照搬 calcOptimalPurchase）
  /// need=还需材料, days=剩余天数 → {cost, plan, totalMat}
  static Map<String, dynamic> optimalPurchase(int need, int days) {
    days = days < 1 ? 1 : days;
    const dailyLimit = 3;
    final cap = dailyLimit * days;
    final gifts = [
      {'name': '30礼包', 'cost': 30, 'mat': 20, 'max': cap},
      {'name': '128礼包', 'cost': 128, 'mat': 60, 'max': cap},
      {'name': '328礼包', 'cost': 328, 'mat': 120, 'max': cap},
      {'name': '648礼包', 'cost': 648, 'mat': 240, 'max': 999999},
    ];
    var bestCost = 1 << 30;
    Map<String, int>? bestPlan;
    var bestTotalMat = 0;
    final max30 = cap < ((need + 19) ~/ 20) ? cap : ((need + 19) ~/ 20);
    for (var c30 = max30; c30 >= 0; c30--) {
      final mat30 = c30 * 20, cost30 = c30 * 30;
      if (cost30 >= bestCost) continue;
      final remainAfter30 = need - mat30 > 0 ? need - mat30 : 0;
      final max128 = cap < ((remainAfter30 + 59) ~/ 60) ? cap : ((remainAfter30 + 59) ~/ 60);
      for (var c128 = max128; c128 >= 0; c128--) {
        final mat128 = c128 * 60, cost128 = c128 * 128;
        if (cost30 + cost128 >= bestCost) continue;
        final remainAfter128 = need - mat30 - mat128 > 0 ? need - mat30 - mat128 : 0;
        final max328 = cap < ((remainAfter128 + 119) ~/ 120) ? cap : ((remainAfter128 + 119) ~/ 120);
        for (var c328 = max328; c328 >= 0; c328--) {
          final mat328 = c328 * 120, cost328 = c328 * 328;
          if (cost30 + cost128 + cost328 >= bestCost) continue;
          final total = mat30 + mat128 + mat328;
          late int cost, c648, planTotal;
          if (total >= need) {
            cost = cost30 + cost128 + cost328; c648 = 0; planTotal = total;
          } else {
            final remain = need - total;
            c648 = (remain + 239) ~/ 240;
            cost = cost30 + cost128 + cost328 + c648 * 648;
            planTotal = total + c648 * 240;
          }
          if (cost < bestCost) {
            bestCost = cost;
            bestPlan = {'30礼包': c30, '128礼包': c128, '328礼包': c328, '648礼包': c648};
            bestTotalMat = planTotal;
          }
        }
      }
    }
    return {'cost': bestCost, 'plan': bestPlan ?? {}, 'totalMat': bestTotalMat};
  }

  /// 计算免费产出 + 还需材料（照搬 doActivityCalc）
  static Map<String, int> calcNeed({required int target, required int owned, required int days,
      required int daily, required bool buyZhanLing}) {
    final freeMat = daily * days + owned;
    final zhanLingMat = buyZhanLing ? 200 : 0;
    final totalFree = freeMat + zhanLingMat;
    final need = target - totalFree > 0 ? target - totalFree : 0;
    return {'freeMat': freeMat, 'totalFree': totalFree, 'need': need,
      'zhanLingCost': buyZhanLing ? 98 : 0};
  }
}
