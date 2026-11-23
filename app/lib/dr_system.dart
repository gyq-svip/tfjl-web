import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
          _tables = d;
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

  static Map<String, double> refineMap(String name) {
    final r = table(name)['洗炼'];
    return (r is Map<String, double>) ? r : Map<String, double>.from(r as Map);
  }

  static double specialVal(String name, String key) {
    final v = table(name)[key];
    return (num.tryParse('$v') ?? 0).toDouble();
  }

  static void setRefine(String tableName, String hero, double? val) {
    final m = refineMap(tableName);
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
    final m = refineMap(table);
    final official = AppData.officialName(cardName);
    if ((m[official] ?? 0) > 0) return official;
    final f = AppData.I.splitFusion(official);
    if (f != null) {
      if ((m[f[0]] ?? 0) > 0) return f[0];
      // 副卡方向：融合名以副卡开头的情况（火炮火灵 主卡是火炮）splitFusion 已覆盖
    }
    // 非分隔符融合回退：所有已设减伤的英雄名里找最长子串匹配（如 火炮射线 → 火炮）
    String? best;
    for (final k in m.keys) {
      if ((m[k] ?? 0) <= 0 || k.contains('精灵')) continue;
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
    final m = refineMap(tableName);
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
        final v = (m[key] ?? 0).toDouble();
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
}

/// 🛡 减伤表管理页（设置某个表的洗炼值 + 小野/酋长/宝库特殊技能减伤）
class DrManagePage extends StatefulWidget {
  final String initialTable;
  const DrManagePage({super.key, this.initialTable = '我的'});
  @override
  State<DrManagePage> createState() => _DrManagePageState();
}

class _DrManagePageState extends State<DrManagePage> {
  late String table;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    table = widget.initialTable;
    DrSystem.load();
  }

  @override
  Widget build(BuildContext context) {
    final refine = DrSystem.refineMap(table);
    final heroes = refine.keys.where((k) {
      final q = _searchCtrl.text.trim();
      return q.isEmpty || k.contains(q);
    }).toList()
      ..sort((a, b) => (refine[b] ?? 0).compareTo(refine[a] ?? 0));
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
      ),
      body: Column(children: [
        // 特殊技能减伤（该表的全局值，上阵对应卡才计入）
        Container(
          margin: const EdgeInsets.all(8),
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
        // 搜索 + 添加
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(children: [
            Expanded(child: TextField(
              controller: _searchCtrl,
              onChanged: (_) => setState(() {}),
              style: const TextStyle(fontSize: 12, color: Colors.white),
              decoration: InputDecoration(hintText: '搜索已设英雄…', isDense: true, filled: true,
                fillColor: const Color(0xFF15152A), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 10)),
            )),
            const SizedBox(width: 6),
            GestureDetector(
              onTap: _addHero,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(color: const Color(0xFF2BB3A3), borderRadius: BorderRadius.circular(8)),
                child: const Text('＋ 添加英雄', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: heroes.isEmpty
              ? Center(child: Text(table == '我的' ? '还没有洗炼减伤，点「＋ 添加英雄」' : '该表没有数据',
                  style: const TextStyle(fontSize: 12, color: Colors.white24)))
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 20),
                  itemCount: heroes.length,
                  itemBuilder: (_, i) {
                    final h = heroes[i];
                    final v = refine[h] ?? 0;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(10)),
                      child: Row(children: [
                        Expanded(child: Text(h, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white),
                            overflow: TextOverflow.ellipsis)),
                        GestureDetector(
                          onTap: () => _editHero(h),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                            decoration: BoxDecoration(color: const Color(0x33FFD24A), borderRadius: BorderRadius.circular(8)),
                            child: Text('${_v(v)}%', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () { DrSystem.setRefine(table, h, null); setState(() {}); },
                          child: const Icon(Icons.close, size: 16, color: Colors.white24),
                        ),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }

  static String _v(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  /// 数值编辑弹窗：输入 0-100 的减伤值
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
      _editValueDialog('$h 洗炼减伤（$table 表）', DrSystem.refineMap(table)[h] ?? 0, (v) => DrSystem.setRefine(table, h, v));

  /// 添加英雄：输入名字（支持短名，自动转官方名）
  Future<void> _addHero() async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: const Text('添加洗炼减伤英雄', style: TextStyle(color: Colors.white, fontSize: 14.5)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: ctl, autofocus: true,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: InputDecoration(hintText: '英雄名（虎弓/蛇女/火炮火灵 都行）', filled: true,
              fillColor: const Color(0xFF0C0C17), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none)),
          ),
          const SizedBox(height: 6),
          const Text('保存后可在列表里再点数值修改', style: TextStyle(fontSize: 10.5, color: Colors.white38)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('取消', style: TextStyle(color: Colors.white.withOpacity(0.6)))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2BB3A3)),
            child: const Text('下一步', style: TextStyle(color: Color(0xFF07231F), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
    final raw = ctl.text.trim();
    if (ok != true || raw.isEmpty) return;
    final official = AppData.officialName(raw);
    await _editValueDialog('$official 洗炼减伤（$table 表）', 0, (v) => DrSystem.setRefine(table, official, v));
  }
}
