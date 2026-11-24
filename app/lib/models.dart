import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

/// 官方数据与融合逻辑（与网页 app-core.js 一致）

class PoolCard {
  final String id, name, type, prof, cat;
  final bool eng;
  PoolCard({required this.id, required this.name, required this.type, required this.prof, required this.cat, required this.eng});

  factory PoolCard.fromJson(Map<String, dynamic> j) => PoolCard(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        type: j['type']?.toString() ?? 'gold',
        prof: j['prof']?.toString() ?? 'warrior',
        cat: j['cat']?.toString() ?? 'gold',
        eng: j['eng'] == true || j['engineering'] == 'true' || j['engineering'] == true,
      );
}

class AppData {
  static const appVersion = '1.8.11';
  static final AppData I = AppData._();
  AppData._();

  List<PoolCard> pool = [];
  final Map<String, PoolCard> poolByName = {};
  final Map<String, List<String>> cloudFusions = {};   // 融合名 -> [主, 副]
  List<PoolCard> fusionCards = [];   // 官方融合卡（作为独立卡显示在卡池）
  final Map<String, List<String>> builtinFusions = {
    '邪能火炮侏儒射线': ['邪能火炮', '侏儒射线'],
    '侏儒射线微型潜艇': ['侏儒射线', '微型潜艇'],
    '邪能火炮微型潜艇': ['邪能火炮', '微型潜艇'],
    '地精宝库侏儒射线': ['地精宝库', '侏儒射线'],
    '地精宝库微型潜艇': ['地精宝库', '微型潜艇'],
    '地精宝库邪能火炮': ['地精宝库', '邪能火炮'],
    '微型潜艇侏儒射线': ['微型潜艇', '侏儒射线'],
    '微型潜艇邪能火炮': ['微型潜艇', '邪能火炮'],
    '侏儒射线邪能火炮': ['侏儒射线', '邪能火炮'],
    '水灵刀客': ['水灵', '刀客'], '刀客水灵': ['刀客', '水灵'],
    '蛇女爱神': ['蛇女', '爱神'], '爱神蛇女': ['爱神', '蛇女'],
    '咕咕天使': ['咕咕', '天使'], '天使咕咕': ['天使', '咕咕'],
    '圣骑天使': ['圣骑', '天使'], '天使圣骑': ['天使', '圣骑'],
    '战将鱼人': ['战将', '鱼人'], '鱼人战将': ['鱼人', '战将'],
    '电法冰法': ['电法', '冰法'], '冰法电法': ['冰法', '电法'],
    '萌萌水灵': ['萌萌', '水灵'], '水灵萌萌': ['水灵', '萌萌'],
    '火灵风灵': ['火灵', '风灵'], '风灵火灵': ['风灵', '火灵'],
  };
  Map<String, dynamic>? lineupLib;   // {sailing:[], activity:[]}

  static const heroAlias = {
    '火炮': '邪能火炮', '宝库': '地精宝库', '射线': '侏儒射线', '潜艇': '微型潜艇',
  };

  Future<void> load() async {
    // 卡池
    final poolRaw = jsonDecode(await rootBundle.loadString('assets/data/pool-cards.json')) as List;
    pool = poolRaw.map((e) => PoolCard.fromJson(e as Map<String, dynamic>)).toList();
    for (final c in pool) {
      poolByName[c.name] = c;
    }
    // 云端融合表（fusions.json，优先）
    try {
      final f = jsonDecode(await rootBundle.loadString('assets/data/fusions.json')) as Map<String, dynamic>;
      final fusions = f['fusions'] as Map<String, dynamic>? ?? {};
      fusions.forEach((k, v) {
        final comps = (v['components'] as List?)?.map((e) => e.toString()).toList() ?? [];
        if (comps.length >= 2) cloudFusions[comps[0] + comps[1]] = comps;
        final q = (v['quality'] ?? '金').toString();
        final type = {'金': 'gold', '紫': 'purple', '蓝': 'blue', '绿': 'green'}[q] ?? 'gold';
        final profCn = (v['profession'] ?? '').toString();
        final profEn = {
          '战士': 'warrior', '法师': 'mage', '射手': 'archer', '召唤': 'summoner',
          '牧师': 'priest', '工程': 'engineering', '熊猫': 'panda', '术士': 'warlock',
        }[profCn] ?? 'warrior';
        fusionCards.add(PoolCard(
          id: 'fusion_$k', name: k, type: type, prof: profEn,
          cat: type, eng: profEn == 'engineering',
        ));
      });
    } catch (_) {}
    // 图库
    try {
      lineupLib = jsonDecode(await rootBundle.loadString('assets/data/lineup-library.json')) as Map<String, dynamic>;
    } catch (_) {
      lineupLib = {'sailing': [], 'activity': []};
    }
  }

  /// 短名 → 官方名；融合串整体转换（火炮射线 → 邪能火炮侏儒射线）
  static String officialName(String name) {
    final s = name.trim();
    if (heroAlias[s] != null) return heroAlias[s]!;
    if (s.length >= 2 && s.length <= 10 && !s.contains('·') && !s.contains(' ')) {
      for (var cut = 1; cut < s.length; cut++) {
        final a = heroAlias[s.substring(0, cut)];
        final b = heroAlias[s.substring(cut)];
        if (a != null && b != null) return a + b;
      }
    }
    return s;
  }

  /// 融合拆分：云端表 → 内置表 → 英雄前缀兜底；非融合返回 null
  List<String>? splitFusion(String cardName) {
    final name = officialName(cardName);
    if (cloudFusions[name] != null) return cloudFusions[name]!;
    if (builtinFusions[name] != null) return builtinFusions[name]!;
    // 前缀兜底：查卡池/已知英雄名单
    for (final h in _allHeroNames()) {
      if (name.length > h.length && name.startsWith(h)) {
        final rest = officialName(name.substring(h.length));
        if (_allHeroNames().contains(rest)) return [h, rest];
      }
    }
    return null;
  }

  /// 卡牌身份（对齐网页 cardIdentity）：融合卡取主卡，基础卡取自身。
  /// 同一身份的手牌只能带 1 张（水灵 和 水灵刀客 是同一身份，不能同时上）。
  String cardIdentity(String name) {
    if (name.isEmpty) return name;
    final dot = name.indexOf('·');
    if (dot > 0) return officialName(name.substring(0, dot));
    final f = splitFusion(name);
    if (f != null && f.isNotEmpty) return officialName(f[0]);
    return officialName(name);
  }

  final List<String> _heroCache = [];
  Set<String> _allHeroNames() {
    if (_heroCache.isEmpty) {
      _heroCache.addAll(poolByName.keys);
      for (final v in cloudFusions.values) {
        _heroCache.addAll(v);
      }
      for (final v in builtinFusions.values) {
        _heroCache.addAll(v);
      }
      _heroCache.addAll(heroAlias.values);
    }
    return _heroCache.toSet();
  }

  /// 某英雄参与的官方融合变体——【严格只认云端官方表】
  /// （内置表仅用于解析历史旧名，不用于生成变体；官方没出的融合不能乱加）
  List<List<String>> fusionVariantsOf(String hero) {
    final official = officialName(hero);
    final out = <List<String>>[];
    final seen = <String>{};
    for (final p in cloudFusions.values) {
      if ((p[0] == official || p[1] == official) && seen.add(p[0] + p[1])) out.add(p);
    }
    return out;
  }

  /// 官方等级档位（getAvailableLevels）
  static List<int> availableLevels(String cardType) {
    switch (cardType) {
      case 'purple':
        return [1, 4, 8, 12, 16, 20, 24];
      case 'blue':
        return [1, 5, 10, 15, 20, 25];
      case 'green':
        return [1, 6, 12, 18, 24];
      default:
        return [1, 3, 6, 9, 12, 15, 18, 21, 24]; // gold / engineering
    }
  }

  static int qualityColor(String t) {
    switch (t) {
      case 'gold': return 0xFFC79A2E;
      case 'purple': return 0xFF7C4BC0;
      case 'blue': return 0xFF2F7FD1;
      case 'green': return 0xFF3F8F45;
      case 'red': return 0xFFC0392B;
      case 'engineering': return 0xFFC79A2E;
      default: return 0xFF3A3A5C;
    }
  }

  static String qualityName(String t) {
    switch (t) {
      case 'gold': return '金卡';
      case 'purple': return '紫卡';
      case 'blue': return '蓝卡';
      case 'green': return '绿卡';
      case 'red': return '红卡';
      default: return t;
    }
  }

  static String profName(String p) {
    switch (p) {
      case 'warrior': return '战士';
      case 'mage': return '法师';
      case 'archer': return '射手';
      case 'summoner': return '召唤';
      case 'priest': return '牧师';
      case 'engineering': return '工程';
      case 'panda': return '熊猫';
      case 'pokeball': return '精灵球';
      case 'warlock': return '术士';
      default: return p;
    }
  }

  /// 战车减伤（走马江湖号=11号）：主车 3×lv+6；副车×融合系数
  static double chariotSideDr(Map? c) {
    if (c == null) return 0;
    final main = (c['main'] ?? 1) as int;
    final mainLv = ((c['mainLv'] ?? 1) as int).clamp(1, 20);
    final sub = (c['sub'] ?? 0) as int;
    final subLv = ((c['subLv'] ?? 1) as int).clamp(1, 20);
    final subF = (c['subFusion'] ?? 0) as int;
    double v = 0;
    if (main == 11) v += mainLv * 3 + 6;
    if (sub == 11) v += (subLv * 3 + 6) * const [0.5, 0.6, 0.7, 0.8][subF.clamp(0, 3)];
    return (v * 10).roundToDouble() / 10;
  }

  /// 23 辆战车（顺序与网页 CHARIOT_LIST 一致；11号=走马江湖号是唯一减伤车）
  static const chariotList = [
    '图腾战车', '皇家宝藏号', '花好月圆号', '先祖之魂号', '上古之树号', '胜利女神号',
    '冰封之魂号', '沉鱼落雁号', '钢铁之心号', '熔岩巨兽号', '走马江湖号', '富甲天下号',
    '银河之光号', '银河之星号', '葫芦神山号', '飞龙在天号', '花果神山号', '地精飞艇号',
    '寂静之月号', '神剑山庄号', '浴火凤凰号', '山河社稷号', '狮王争霸号',
  ];

  static String chariotName(int idx) =>
      (idx >= 1 && idx <= chariotList.length) ? chariotList[idx - 1] : '';

  static bool chariotIsDr(int idx) => chariotName(idx).contains('走马');

  /// 战车简写（网页 chariotShort）：只设主车 → 主车名去"号"；
  /// 主+副 → 两车开头2字相同则各取后2字（银河之光+银河之星→之光之星），否则各取前2字
  static String chariotShort(int main, int sub) {
    final a = chariotName(main);
    if (a.isEmpty) return '未设置';
    final ca = a.endsWith('号') ? a.substring(0, a.length - 1) : a;
    if (sub <= 0 || sub == main) return ca;
    final b = chariotName(sub);
    if (b.isEmpty) return ca;
    final cb = b.endsWith('号') ? b.substring(0, b.length - 1) : b;
    final sameHead = ca.length >= 2 && cb.length >= 2 && ca.substring(0, 2) == cb.substring(0, 2);
    if (sameHead) return ca.substring(ca.length - 2) + cb.substring(cb.length - 2);
    return ca.substring(0, 2) + cb.substring(0, 2);
  }

  /// project.json 手牌里的卡
  static Map<String, dynamic> emptyProject({String name = '新项目', String category = '我的'}) => {
        'name': name,
        'category': category,
        'myHandCards': <dynamic>[],
        'teammateHandCards': <dynamic>[],
        'cardLevels': {},
        'cardSkins': {},
        'cardMoHua': {},
        'fusionSkins': {},
      };
}
