import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'models.dart';

/// 🛡 减伤系统 —— 逐条照搬网页 app-core.js：
/// 数据：drTables = { '我的': {洗炼:{英雄:值}, 小野:0, 酋长:0, 宝库:0}, '队友': {...} }
/// 存盘键与网页同名：tdjl_dr_tables_v2（PC 备份的 localStorage 里就是这个键，导入可互通）
/// 计算（getDamageReductionBreakdown）：
///   总减伤 = 战车减伤(仅走马江湖号,主车3×lv+6/副车×融合系数) + 上阵卡的洗炼减伤(主卡身份去重)
///            + 小野/酋长/宝库特殊技能减伤(上阵含该名才计,每种一次,值按表)
///   洗炼 key 匹配：整名 > 融合主卡(parts[0]) > 非分隔符融合回退(火炮射线→火炮,最长匹配)
class DrSystem {
  static const prefKey = 'tdjl_dr_tables_v2';
  static const tableNames = ['我的', '队友'];
  static const specialKeys = ['小野', '酋长', '宝库'];

  /// 内存缓存：{表名: {'洗炼': {英雄: 值}, '小野': 0, '酋长': 0, '宝库': 0}}
  static Map<String, dynamic>? _tables;
  static bool _loaded = false;

  static Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final s = prefs.getString(prefKey);
      if (s != null && s.isNotEmpty) {
        final d = jsonDecodeMap(s);
        if (d != null) {
          // 🔴 存盘格式是 {'tables':{...}}（与网页 serializeDrTables 一致）；直接表字典也兼容
          final t = (d['tables'] is Map) ? Map<String, dynamic>.from(d['tables'] as Map) : d;
          _tables = t;
          _ensureDefaults();
          return;
        }
      }
    } catch (_) {}
    _tables = _defaults();
  }

  static Future<void> save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(prefKey, jsonEncodeMap(_tables ?? _defaults()));
    } catch (_) {}
  }

  /// 从 PC 备份的 localStorage 恢复（导入备份时调用）
  static Future<void> restoreFromPcLocal(String? v2) async {
    if (v2 == null || v2.isEmpty) return;
    try {
      final d = jsonDecodeMap(v2);
      if (d == null) return;
      // PC 存的是 {tables:{...}} 或直接 {表名:{...}}，两种都兼容
      final t = (d['tables'] is Map) ? d['tables'] : d;
      _tables = Map<String, dynamic>.from(t as Map);
      _ensureDefaults();
      _loaded = true;
      await save();
    } catch (_) {}
  }

  /// 导出成 PC 兼容的 localStorage 片段
  static String exportForPc() {
    return jsonEncodeMap({'tables': _tables ?? _defaults()});
  }

  /// 测试专用：重置缓存并重新加载
  static Future<void> reloadForTest() async {
    _loaded = false;
    _tables = null;
    await load();
  }

  static Map<String, dynamic> _defaults() => {
        for (final n in tableNames)
          n: {'洗炼': <String, double>{}, '小野': 0.0, '酋长': 0.0, '宝库': 0.0},
      };

  static void _ensureDefaults() {
    final t = _tables!;
    for (final n in tableNames) {
      t[n] ??= _defaults()[n];
      final tbl = t[n] as Map;
      tbl['洗炼'] ??= <String, double>{};
      for (final k in specialKeys) {
        tbl[k] ??= 0.0;
      }
    }
  }

  static Map<String, dynamic> table(String name) {
    final t = _tables ?? _defaults();
    return (t[name] as Map<String, dynamic>?) ?? (_defaults()[name] as Map<String, dynamic>);
  }

  /// 🔴 返回「真实可变」的洗炼 Map（原来是 copy，setRefine 全写丢）
  static Map<String, dynamic> refineMap(String name) {
    final t = table(name);
    final r = t['洗炼'];
    if (r is Map<String, dynamic>) return r;
    final m = Map<String, dynamic>.from(r as Map);
    t['洗炼'] = m;
    return m;
  }

  /// 洗炼取值（num → double，缺失=0）
  static double refineVal(String tableName, String hero) {
    final v = refineMap(tableName)[hero];
    return (num.tryParse('$v') ?? 0).toDouble();
  }

  static double specialVal(String name, String key) {
    final v = table(name)[key];
    return (num.tryParse('$v') ?? 0).toDouble();
  }

  static void setRefine(String tableName, String hero, double? val) {
    final m = refineMap(tableName);   // 真实可变 map
    if (val == null || val <= 0) {
      m.remove(hero);
    } else {
      m[hero] = val;
    }
    save();
  }

  static void setSpecial(String tableName, String key, double val) {
    table(tableName)[key] = val;
    save();
  }

  // ================= 计算 =================

  /// 洗炼 key 匹配：整名 > 融合主卡 > 非分隔符融合最长基础卡匹配（网页 findBaseCardInFusion）
  static String? refineKeyFor(String table, String cardName) {
    final official = AppData.officialName(cardName);
    if (refineVal(table, official) > 0) return official;
    final f = AppData.I.splitFusion(official);
    if (f != null && refineVal(table, f[0]) > 0) return f[0];
    // 非分隔符融合回退：已设减伤的英雄名里找最长子串匹配（如 火炮射线 → 火炮）
    String? best;
    for (final k in refineMap(table).keys) {
      if (refineVal(table, k) <= 0 || k.contains('精灵')) continue;
      if (official != k && official.contains(k)) {
        if (best == null || k.length > best.length) best = k;
      }
    }
    return best;
  }

  /// 单侧减伤拆分。cards = 该侧手牌（含 placed 字段），只算已上阵的；chariot = 该侧战车配置
  static Map<String, double> breakdown({
    required List<dynamic> handCards,
    required String tableName,
    Map<String, dynamic>? chariot,
  }) {
    final bd = {'total': 0.0, 'refine': 0.0, 'xiaoye': 0.0, 'qiuzhang': 0.0, 'baoku': 0.0, 'chariot': 0.0};
    // 战车（AppData.chariotSideDr 与网页 chariotDrInfo 同公式）
    final cDr = AppData.chariotSideDr(chariot);
    if (cDr > 0) {
      bd['chariot'] = bd['chariot']! + cDr;
      bd['total'] = bd['total']! + cDr;
    }
    final seen = <String>{};
    for (final raw in handCards) {
      if (raw is! Map) continue;
      if (raw['profession'] == 'pokeball') continue;   // 精灵球不参与
      final placed = raw['placed']?.toString() ?? '';
      if (placed.isEmpty || placed == 'null') continue; // 只算上阵
      final cardName = raw['name']?.toString() ?? '';
      if (cardName.isEmpty) continue;
      final official = AppData.officialName(cardName);
      // 洗炼（主卡身份去重）
      final key = refineKeyFor(tableName, official);
      if (key != null && !seen.contains(key)) {
        seen.add(key);
        final v = refineVal(tableName, key);
        if (v > 0) {
          bd['refine'] = bd['refine']! + v;
          bd['total'] = bd['total']! + v;
        }
      }
      // 特殊技能（小野/酋长/宝库，各计一次）
      for (final sp in specialKeys) {
        if (!official.contains(sp)) continue;
        final seenKey = '_special_$sp';
        if (seen.contains(seenKey)) continue;
        seen.add(seenKey);
        final v = specialVal(tableName, sp);
        if (v > 0) {
          bd['total'] = bd['total']! + v;
          bd[sp == '小野' ? 'xiaoye' : sp == '酋长' ? 'qiuzhang' : 'baoku'] =
              bd[sp == '小野' ? 'xiaoye' : sp == '酋长' ? 'qiuzhang' : 'baoku']! + v;
        }
      }
    }
    for (final k in bd.keys.toList()) {
      bd[k] = double.parse(bd[k]!.toStringAsFixed(1));
    }
    return bd;
  }

  /// 悬浮提示文本（网页 formatDrTooltip：0 项隐藏）
  static String tooltip(Map<String, double> bd) {
    final parts = <String>[];
    if (bd['refine']! > 0) parts.add('洗炼${_fmt(bd['refine']!)}');
    if (bd['qiuzhang']! > 0) parts.add('酋长${_fmt(bd['qiuzhang']!)}');
    if (bd['xiaoye']! > 0) parts.add('小野${_fmt(bd['xiaoye']!)}');
    if (bd['baoku']! > 0) parts.add('宝库${_fmt(bd['baoku']!)}');
    if (bd['chariot']! > 0) parts.add('战车减伤${_fmt(bd['chariot']!)}');
    if (parts.isEmpty) return '暂无减伤';
    return '${parts.join('+')}=合计${_fmt(bd['total']!)}';
  }

  static String _fmt(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  // JSON helpers（避免每处 import dart:convert）
  static Map<String, dynamic>? jsonDecodeMap(String s) {
    try {
      final o = const JsonDecoder().convert(s);
      return o is Map ? Map<String, dynamic>.from(o) : null;
    } catch (_) {
      return null;
    }
  }

  static String jsonEncodeMap(Object? o) => const JsonEncoder().convert(o);

  // ================= TXT 导入导出（照搬网页 exportAllDamageReductionToTxt / parseDamageReductionTxt） =================

  static const favKey = 'tdjl_dr_favCards';
  static List<String> _favs = [];

  static Future<List<String>> loadFavs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final s = prefs.getString(favKey);
      final l = s == null ? null : List<String>.from((const JsonDecoder().convert(s) as List?) ?? []);
      _favs = l ?? [];
    } catch (_) {
      _favs = [];
    }
    return _favs;
  }

  static Future<void> toggleFav(String cardName) async {
    if (_favs.contains(cardName)) {
      _favs.remove(cardName);
    } else {
      _favs.insert(0, cardName);
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(favKey, const JsonEncoder().convert(_favs));
    } catch (_) {}
  }

  static bool isFav(String cardName) => _favs.contains(cardName);

  /// 导出全部表为 TXT（网页同款格式：===== 表：XXX ===== 分段 + 技能减伤/洗炼减伤两段）
  static String exportAllTxt() {
    final buf = StringBuffer();
    buf.writeln('# 减伤记录配置文件（全部表）');
    buf.writeln('# 每张表以 ===== 表：表名 ===== 分段，段内分「技能减伤 / 洗炼减伤」');
    buf.writeln('# 导入时按表名自动分流（不存在的表会自动新建）');
    buf.writeln('# 导出时间：${DateTime.now().toLocal()}');
    buf.writeln();
    for (final name in tableNames) {
      final t = table(name);
      buf.writeln('===== 表：$name =====');
      buf.writeln('----- 技能减伤 -----');
      for (final k in specialKeys) {
        buf.writeln('$k=${(num.tryParse('${t[k]}') ?? 0)}');
      }
      buf.writeln('----- 洗炼减伤 -----');
      final m = refineMap(name);
      for (final c in (m.keys.toList()..sort())) {
        buf.writeln('$c=${(num.tryParse('${m[c]}') ?? 0)}');
      }
      buf.writeln();
    }
    return buf.toString();
  }

  /// 解析 TXT 并写入（网页 parseDamageReductionTxt 全逻辑）：
  /// 单表文件写入 targetTable；多表文件（===== 表：XXX =====）按表名分流，不存在的表自动新建。
  /// 返回结果文案。
  static Future<String> importTxt(String content, String targetTable) async {
    if (_tables == null) await load();
    final sharedKeys = specialKeys;
    var section = '';
    var curName = targetTable;
    final touched = <String>{};
    var recCount = 0;

    void ensureTable(String name) {
      if (!_tables!.containsKey(name)) {
        _tables![name] = {'洗炼': <String, double>{}, '小野': 0.0, '酋长': 0.0, '宝库': 0.0};
      }
    }

    for (final rawLine in content.split('\n')) {
      final line = rawLine.replaceFirst(RegExp(r'\r+$'), '');
      if (line.startsWith('#') || line.trim().isEmpty) continue;
      if (line.contains('=====')) {
        if (line.contains('表：')) {
          final namePart = line.substring(line.indexOf('表：') + 2).replaceFirst(RegExp(r'=+$'), '').trim();
          if (namePart.isNotEmpty) curName = namePart;
          section = '';
          continue;
        }
        if (line.contains('洗炼')) {
          section = 'refine';
        } else if (line.contains('技能')) {
          section = 'skill';
        } else if (line.contains('战车')) {
          section = 'chariot';
        }
        continue;
      }
      final m = RegExp(r'^([^=]+)=(\d+(?:\.\d+)?)$').firstMatch(line);
      if (m == null) continue;
      var cardName = m.group(1)!.trim();
      final value = double.tryParse(m.group(2)!);
      if (cardName == '战车') cardName = '我的战车';
      if (cardName.isEmpty || value == null) continue;
      if (cardName == '我的战车' || cardName == '队友战车') continue;   // 废弃字段
      ensureTable(curName);
      final tb = _tables![curName] as Map;
      if (section == 'refine') {
        (tb['洗炼'] as Map)[cardName] = value;   // 洗炼段：即使叫小野/酋长/宝库也只写洗炼
        touched.add(curName);
        recCount++;
      } else if (section == 'skill') {
        if (sharedKeys.contains(cardName)) {
          tb[cardName] = value;
        } else {
          (tb['洗炼'] as Map)[cardName] = value;
        }
        touched.add(curName);
        recCount++;
      } else if (section == 'chariot') {
        continue;   // 旧导出的战车段忽略
      } else if (sharedKeys.contains(cardName)) {
        tb[cardName] = value;   // 老文件无分段：按名字路由
        touched.add(curName);
        recCount++;
      } else {
        (tb['洗炼'] as Map)[cardName] = value;
        touched.add(curName);
        recCount++;
      }
    }
    _ensureDefaults();
    await save();
    if (touched.length == 1) {
      return '已导入到「${touched.first}」表（共 $recCount 条）';
    } else if (touched.length > 1) {
      return '已导入 ${touched.length} 张表（共 $recCount 条）：${touched.join('、')}';
    }
    return '未找到有效的减伤记录';
  }
}

/// 🛡 减伤表管理页（照搬网页：英雄全部预设好按职业筛选，点卡填值；常用⭐置顶；TXT 导入导出）
class DrManagePage extends StatefulWidget {
  final String initialTable;
  const DrManagePage({super.key, this.initialTable = '我的'});
  @override
  State<DrManagePage> createState() => _DrManagePageState();
}

class _DrManagePageState extends State<DrManagePage> {
  late String table;
  final _searchCtrl = TextEditingController();
  String _profFilter = 'all';   // all / fav / 职业英文
  List<String> _favs = [];

  @override
  void initState() {
    super.initState();
    table = widget.initialTable;
    DrSystem.load().then((_) async {
      _favs = await DrSystem.loadFavs();
      if (mounted) setState(() {});
    });
  }

  /// 全部卡池英雄（预设好，排除精灵球）——与网页 buildDamageReductionCardsList 同思路
  List<PoolCard> get _allHeroes =>
      AppData.I.poolByName.values.where((p) => p.prof != 'pokeball').toList()
        ..sort((a, b) => a.name.compareTo(b.name));

  List<String> get _profChips {
    final set = <String>{};
    for (final p in _allHeroes) {
      set.add(p.prof);
    }
    return set.toList();
  }

  List<PoolCard> get _visibleHeroes {
    final q = _searchCtrl.text.trim();
    return _allHeroes.where((p) {
      if (_profFilter == 'fav' && !DrSystem.isFav(p.name)) return false;
      if (_profFilter != 'all' && _profFilter != 'fav' && p.prof != _profFilter) return false;
      if (q.isNotEmpty) {
        final official = AppData.officialName(p.name);
        final hasVal = DrSystem.refineVal(table, p.name) > 0;
        if (!p.name.contains(q) && !official.contains(q) && !hasVal) return false;
      }
      return true;
    }).toList()
      ..sort((a, b) {
        final fa = DrSystem.isFav(a.name) ? 0 : 1;
        final fb = DrSystem.isFav(b.name) ? 0 : 1;
        if (fa != fb) return fa - fb;
        return a.name.compareTo(b.name);
      });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C17),
      appBar: AppBar(
        backgroundColor: const Color(0xFF12122A),
        foregroundColor: Colors.white,
        title: Row(children: [
          const Text('🛡 减伤表', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(width: 10),
          for (final n in DrSystem.tableNames)
            GestureDetector(
              onTap: () => setState(() => table = n),
              child: Container(
                margin: const EdgeInsets.only(right: 5),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: table == n ? const Color(0xFF2BB3A3) : Colors.white.withAlpha(35),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text(n, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold,
                    color: table == n ? const Color(0xFF07231F) : Colors.white70)),
              ),
            ),
        ]),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, size: 20),
            color: const Color(0xFF1E1E36),
            onSelected: (v) async {
              if (v == 'exportAll') {
                final save = await FilePicker.platform.saveFile(
                    fileName: '减伤记录_全部表.txt', type: FileType.custom, allowedExtensions: ['txt']);
                if (save == null) return;
                await File(save).writeAsString(DrSystem.exportAllTxt());
                if (mounted) _toast('✅ 已导出全部表（PC 端「导入减伤TXT」可整体恢复）：$save');
              } else if (v == 'exportCur') {
                final save = await FilePicker.platform.saveFile(
                    fileName: '减伤记录_$table.txt', type: FileType.custom, allowedExtensions: ['txt']);
                if (save == null) return;
                final t = DrSystem.table(table);
                final buf = StringBuffer('# 减伤记录（$table 表）\n----- 技能减伤 -----\n');
                for (final k in DrSystem.specialKeys) {
                  buf.writeln('$k=${(num.tryParse('${t[k]}') ?? 0)}');
                }
                buf.writeln('----- 洗炼减伤 -----');
                final m = DrSystem.refineMap(table);
                for (final c in (m.keys.toList()..sort())) {
                  buf.writeln('$c=${(num.tryParse('${m[c]}') ?? 0)}');
                }
                await File(save).writeAsString(buf.toString());
                if (mounted) _toast('✅ 已导出「$table」表：$save');
              } else if (v == 'import') {
                await _importTxt();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'exportAll', height: 38, child: Text('📤 导出全部表 (TXT)', style: TextStyle(fontSize: 12, color: Colors.white))),
              PopupMenuItem(value: 'exportCur', height: 38, child: Text('📤 导出当前表 (TXT)', style: TextStyle(fontSize: 12, color: Colors.white))),
              PopupMenuItem(value: 'import', height: 38, child: Text('📥 导入减伤 TXT（多表自动分流）', style: TextStyle(fontSize: 12, color: Colors.white))),
            ],
          ),
        ],
      ),
      body: Column(children: [
        // 特殊技能减伤
        Container(
          margin: const EdgeInsets.fromLTRB(8, 8, 8, 4),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('✨ 特殊技能减伤（上阵对应卡才计入 · 「$table」表）',
                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF9BE9E0))),
            const SizedBox(height: 6),
            Row(children: [
              for (final sp in DrSystem.specialKeys)
                Expanded(
                  child: GestureDetector(
                    onTap: () => _editSpecial(sp),
                    child: Container(
                      margin: EdgeInsets.only(right: sp == '宝库' ? 0 : 6),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: DrSystem.specialVal(table, sp) > 0 ? const Color(0x332BB3A3) : Colors.white.withAlpha(20),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(children: [
                        Text(sp, style: const TextStyle(fontSize: 11, color: Colors.white70)),
                        Text('${_v(DrSystem.specialVal(table, sp))}%',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold,
                                color: DrSystem.specialVal(table, sp) > 0 ? const Color(0xFF4ade80) : Colors.white24)),
                      ]),
                    ),
                  ),
                ),
            ]),
          ]),
        ),
        // 搜索
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (_) => setState(() {}),
            style: const TextStyle(fontSize: 12, color: Colors.white),
            decoration: InputDecoration(hintText: '搜索英雄（虎弓/蛇女/火炮火灵 都行）…', isDense: true, filled: true,
              fillColor: const Color(0xFF15152A), prefixIcon: const Icon(Icons.search, size: 18, color: Colors.white24),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(horizontal: 10)),
          ),
        ),
        // 职业筛选 chips
        Container(
          height: 34,
          margin: const EdgeInsets.only(top: 5),
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            children: [
              _chip('all', '全部'),
              _chip('fav', '⭐ 常用'),
              for (final p in _profChips) _chip(p, AppData.profName(p)),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 20),
            itemCount: _visibleHeroes.length,
            itemBuilder: (_, i) {
              final p = _visibleHeroes[i];
              final m = DrSystem.refineMap(table);
              final v = (num.tryParse('${m[p.name]}') ?? 0).toDouble();
              final fav = DrSystem.isFav(p.name);
              return Container(
                margin: const EdgeInsets.only(bottom: 5),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: v > 0 ? const Color(0xFF1A2438) : const Color(0xFF15152A),
                  borderRadius: BorderRadius.circular(10),
                  border: v > 0 ? Border.all(color: const Color(0x554ade80)) : null,
                ),
                child: Row(children: [
                  GestureDetector(
                    onTap: () async { await DrSystem.toggleFav(p.name); _favs = await DrSystem.loadFavs(); setState(() {}); },
                    child: Text(fav ? '⭐' : '☆', style: const TextStyle(fontSize: 14)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(p.name,
                      style: TextStyle(fontSize: 12.5, fontWeight: v > 0 ? FontWeight.bold : FontWeight.normal,
                          color: v > 0 ? Colors.white : Colors.white60),
                      overflow: TextOverflow.ellipsis)),
                  GestureDetector(
                    onTap: () => _editHero(p.name),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: v > 0 ? const Color(0x334ade80) : Colors.white.withAlpha(25),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(v > 0 ? '${_v(v)}%' : '点击填',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold,
                              color: v > 0 ? const Color(0xFF4ade80) : Colors.white24)),
                    ),
                  ),
                ]),
              );
            },
          ),
        ),
      ]),
    );
  }

  Widget _chip(String key, String label) {
    final on = _profFilter == key;
    return GestureDetector(
      onTap: () => setState(() => _profFilter = key),
      child: Container(
        margin: const EdgeInsets.only(right: 5),
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(
          color: on ? const Color(0xFF2BB3A3) : Colors.white.withAlpha(28),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold,
            color: on ? const Color(0xFF07231F) : Colors.white60)),
      ),
    );
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 3)));
  }

  /// 📥 导入 TXT（网页 parseDamageReductionTxt：多表自动分流，单表入当前表）
  Future<void> _importTxt() async {
    final picked = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['txt'], withData: true);
    final path = picked?.files.single.path;
    if (path == null) return;
    try {
      final txt = await File(path).readAsString();
      final r = await DrSystem.importTxt(txt, table);
      if (mounted) setState(() {});
      _toast(r);
    } catch (e) {
      _toast('❌ 导入失败：$e');
    }
  }

  static String _v(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  /// 数值编辑弹窗：输入 0-100 的减伤值 + 快捷值
  Future<void> _editValueDialog(String title, double init, void Function(double) onSave) async {
    final ctl = TextEditingController(text: init > 0 ? _v(init) : '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 14.5)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          TextField(controller: ctl, autofocus: true, keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            decoration: InputDecoration(hintText: '减伤 %，如 27', filled: true,
              fillColor: const Color(0xFF0C0C17), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none)),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 6, children: [
            for (final q in [6.0, 9.0, 12.0, 15.0, 18.0, 21.0, 24.0, 27.0, 30.0])
              GestureDetector(
                onTap: () { ctl.text = _v(q); },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white.withAlpha(30), borderRadius: BorderRadius.circular(6)),
                  child: Text('${q.toInt()}', style: const TextStyle(fontSize: 11, color: Colors.white70)),
                ),
              ),
          ]),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('取消', style: TextStyle(color: Colors.white.withOpacity(0.6)))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2BB3A3)),
            child: const Text('保存', style: TextStyle(color: Color(0xFF07231F), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
    if (ok == true) {
      final v = double.tryParse(ctl.text.trim()) ?? 0;
      onSave(v.clamp(0, 100).toDouble());
      if (mounted) setState(() {});
    }
  }

  Future<void> _editSpecial(String sp) =>
      _editValueDialog('$sp 特殊技能减伤（$table 表）', DrSystem.specialVal(table, sp), (v) => DrSystem.setSpecial(table, sp, v));

  Future<void> _editHero(String h) =>
      _editValueDialog('$h 洗炼减伤（$table 表）', DrSystem.refineVal(table, h), (v) => DrSystem.setRefine(table, h, v));
}
