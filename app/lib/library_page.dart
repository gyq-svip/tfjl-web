import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';
import 'data_store.dart';
import 'card_widget.dart';
import 'dr_system.dart';
import 'sheets.dart';
import 'ui_alpha.dart';
import 'global_defaults.dart';
import 'telemetry.dart';

/// 📚 阵容图库：⭐精选（在线） / 🏆活动（7天A/B） / 🚢大航海（223套）
class LibraryPage extends StatefulWidget {
  const LibraryPage({super.key});
  @override
  State<LibraryPage> createState() => _LibraryPageState();
}

class _LibraryPageState extends State<LibraryPage> {
  int tab = 0;
  Map<String, dynamic> featured = {'items': []};
  final Set<int> expandedSailing = {};
  static const _cacheKey = 'library_featured_cache';
  static const _cacheAtKey = 'library_featured_cache_at';
  bool _refreshing = false;
  String _cacheTime = '';
  /// ⭐精选本机设置：{ '<阵容id>_a'/'_b': { chariot:{main,sub,mainLv,subLv}, table:'我的'|'队友' } }
  Map<String, dynamic> _featCfg = {};
  static const _featCfgKey = 'library_feat_cfg';

  @override
  void initState() {
    super.initState();
    Telemetry.I.enterPage('library');
    Telemetry.I.action('library_open');
    _initLoad();
    _loadFeatCfg();
    GlobalCfg.load().then((_) { if (mounted) setState(() {}); });   // 全局默认（卡/战车/减伤）
    // 🔴 2026-11-24 图库独立确保皮肤包就绪：卡图依赖 SkinPack，若主启动时没下完这里补一次
    if (!SkinPack.I.ready) {
      SkinPack.I.ensurePack().then((_) { if (mounted) setState(() {}); });
    }
  }

  /// 缓存秒开 + 后台刷新（图库是死数据，很久才更新一次，没必要每次等网络）
  Future<void> _initLoad() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_cacheKey);
    if (cached != null && cached.isNotEmpty) {
      try {
        final j = jsonDecode(cached) as Map<String, dynamic>;
        if ((j['items'] as List?)?.isNotEmpty == true) {
          final at = prefs.getInt(_cacheAtKey) ?? 0;
          if (mounted) {
            setState(() {
              featured = j;
              _cacheTime = at > 0 ? _fmtTime(at) : '';
            });
          }
        }
      } catch (_) {}
    }
    _loadFeatured();
  }

  static String _fmtTime(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${d.month}/${d.day} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _loadFeatured() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    try {
      // 精选 gist id（room_index.json 配置 = eba2aa1c…；直接用它，秒开不等索引）
      const gid = 'eba2aa1c41025fd2ff5beecff2668c3f';
      // 双通道并行竞速：token API（快）∥ raw 直链（稳），谁先回用谁，20 秒封顶
      final txt = await _raceRead(gid);
      if (txt == null || txt.isEmpty) return;
      final j = jsonDecode(txt) as Map<String, dynamic>;
      if ((j['items'] as List?)?.isNotEmpty != true) return;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, txt);
      await prefs.setInt(_cacheAtKey, DateTime.now().millisecondsSinceEpoch);
      if (mounted) {
        setState(() {
          featured = j;
          _cacheTime = _fmtTime(DateTime.now().millisecondsSinceEpoch);
        });
      }
    } catch (_) {
      // 失败保留缓存内容
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  /// 两路并行读取 featured_lineups.json，先成功者胜（20s 封顶，避免单路卡死拖满超时预算）
  Future<String?> _raceRead(String gid) {
    final c = Completer<String?>();
    void win(String? v) {
      if (!c.isCompleted && v != null && v.isNotEmpty) c.complete(v);
    }
    GistClient.readFileApiFirst(gid, 'featured_lineups.json').then(win).catchError((_) {});
    GistClient.readFile(gid, 'featured_lineups.json').then(win).catchError((_) {});
    GistClient.readFile(GistClient.masterGist, 'featured_lineups.json').then(win).catchError((_) {});
    Future.delayed(const Duration(seconds: 20), () {
      if (!c.isCompleted) c.complete(null);
    });
    return c.future;
  }

  Future<String?> httpGet(String url) async {
    try {
      final client = HttpClient();
      final req = await client.getUrl(Uri.parse(url));
      final resp = await req.close();
      if (resp.statusCode == 200) return await resp.transform(utf8.decoder).join();
    } catch (_) {}
    return null;
  }

  @override
  void dispose() {
    Telemetry.I.enterPage('home');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(children: [
          Container(
            color: UiAlpha.bg(const Color(0xFF12122A)),
            padding: const EdgeInsets.all(8),
            child: Row(children: [
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 34, height: 30, alignment: Alignment.center,
                  decoration: BoxDecoration(color: Colors.white.withAlpha(50), borderRadius: BorderRadius.circular(7)),
                  child: const Text('‹', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(width: 8),
              const Text('📚 阵容图库', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
              const Spacer(),
              for (var i = 0; i < 3; i++)
                GestureDetector(
                  onTap: () => setState(() => tab = i),
                  child: Container(
                    margin: const EdgeInsets.only(left: 5),
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
                    decoration: BoxDecoration(
                      color: tab == i ? const Color(0xFF2BB3A3) : const Color(0xFF242442),
                      borderRadius: BorderRadius.circular(7),
                    ),
                    child: Text(const ['⭐ 精选', '🏆 活动', '🚢 航海'][i],
                        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold,
                            color: tab == i ? const Color(0xFF07231F) : const Color(0xFFCFD6E6))),
                  ),
                ),
            ]),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(5),
              child: Column(children: [
                if (tab == 0) _featured(),
                if (tab == 1) _activity(),
                if (tab == 2) _sailing(),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  // ------------------------------------------------------------ ⭐ 精选
  Widget _featured() {
    final items = (featured['items'] as List?) ?? [];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
        child: Row(children: [
          Expanded(
            child: Text(
              '⭐ 精选阵容${_cacheTime.isNotEmpty ? "（缓存 $_cacheTime）" : ""} · 点卡调设置 · 「用此阵容」导入项目',
              style: const TextStyle(fontSize: 9.5, color: Color(0xFF9AA4B8)),
            ),
          ),
          GestureDetector(
            onTap: _refreshing ? null : _loadFeatured,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(color: Colors.white.withAlpha(28), borderRadius: BorderRadius.circular(6)),
              child: Text(_refreshing ? '刷新中…' : '🔄 刷新',
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold,
                      color: _refreshing ? Colors.white24 : const Color(0xFF4ECDC4))),
            ),
          ),
        ]),
      ),
      if (items.isEmpty)
        Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: Text(_refreshing ? '精选阵容加载中…（首次需联网）' : '精选阵容为空，点右上「🔄 刷新」重试',
                style: const TextStyle(color: Colors.white38, fontSize: 12)),
          ),
        ),
      for (final itRaw in items.where(_hasCards)) _featuredCard(itRaw as Map<String, dynamic>),
    ]);
  }

  Future<void> _loadFeatCfg() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final t = prefs.getString(_featCfgKey);
      if (t != null && t.isNotEmpty) {
        final j = jsonDecode(t);
        if (j is Map) {
          if (mounted) setState(() => _featCfg = Map<String, dynamic>.from(j));
          else _featCfg = Map<String, dynamic>.from(j);
        }
      }
    } catch (_) {}
  }

  Future<void> _saveFeatCfg() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_featCfgKey, jsonEncode(_featCfg));
    } catch (_) {}
  }

  /// 取某组的有效设置（本机设置优先，否则用数据里的战车 + 默认表）
  Map<String, dynamic> _sideCfg(String itemId, bool isMine, Map<String, dynamic> pj) {
    final scope = itemId.startsWith('act_') ? 'act' : 'feat';
    final useGlobal = scope == 'act' ? GlobalCfg.actApplyAll : GlobalCfg.featApplyAll;
    if (useGlobal) {
      final g = GlobalCfg.sideCfg(scope, isMine);
      if (g['chariot'] is Map && (g['chariot'] as Map).isNotEmpty) {
        return {'chariot': Map<String, dynamic>.from(g['chariot'] as Map),
            'table': g['table']?.toString() ?? (isMine ? '我的' : '队友')};
      }
    }
    final k = '${itemId}_${isMine ? "a" : "b"}';
    final c = _featCfg[k];
    Map<String, dynamic> ch = {};
    final saved = (c is Map) ? c['chariot'] : null;
    if (saved is Map && saved.isNotEmpty) {
      ch = Map<String, dynamic>.from(saved);
    } else {
      final raw = pj[isMine ? 'myChariot' : 'teammateChariot'];
      if (raw is Map) ch = Map<String, dynamic>.from(raw);
    }
    final t = (c is Map) ? (c['table']?.toString() ?? '') : '';
    final table = t.isNotEmpty ? t : (isMine ? '我的' : '队友');
    return {'chariot': ch, 'table': table};
  }

  /// 过滤空阵容（数据里可能有 A/B 都没卡的占位项）
  bool _hasCards(dynamic e) {
    if (e is! Map) return false;
    final d = e['data'];
    if (d is! Map) return false;
    final a = (d['myHandCards'] as List?) ?? const [];
    final b = (d['teammateHandCards'] as List?) ?? const [];
    return a.isNotEmpty || b.isNotEmpty;
  }

  Widget _featuredCard(Map<String, dynamic> it) {
    final pjRaw = it['data'];
    if (pjRaw is! Map) return const SizedBox();
    final pj = Map<String, dynamic>.from(pjRaw);
    final name = it['name']?.toString() ?? '未命名';
    final cat = it['category']?.toString() ?? '';
    final itemId = (it['id']?.toString().isNotEmpty == true) ? it['id'].toString() : name;
    final aHand = (pj['myHandCards'] as List?) ?? const [];
    final bHand = (pj['teammateHandCards'] as List?) ?? const [];
    final cfgA = _sideCfg(itemId, true, pj);
    final cfgB = _sideCfg(itemId, false, pj);
    double? drA, drB;
    try {
      drA = DrSystem.breakdown(handCards: aHand, tableName: cfgA['table'] as String,
          chariot: cfgA['chariot'] as Map<String, dynamic>)['total'];
    } catch (_) {}
    try {
      drB = DrSystem.breakdown(handCards: bHand, tableName: cfgB['table'] as String,
          chariot: cfgB['chariot'] as Map<String, dynamic>)['total'];
    } catch (_) {}
    return LayoutBuilder(builder: (ctx, cs) {
      const gap = 3.0;
      final w = ((cs.maxWidth - 14 - gap * 4) / 5).clamp(26.0, 74.0);
      return Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(color: UiAlpha.bg(const Color(0xFF15152A)), borderRadius: BorderRadius.circular(10)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // 🔴 紧凑单行：名称 · 分类 · A战车减伤 · 用此阵容（A组标题不再单独占一行）
          _featGroup('🅰 A组（我方）', const Color(0xFF4ECDC4), aHand, true, pj, w, itemId, cfgA, drA,
            titleOverride: Row(children: [
              Flexible(flex: 3, child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A)))),
              if (cat.isNotEmpty) ...[
                const SizedBox(width: 3),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                  decoration: BoxDecoration(color: const Color(0x332BB3A3), borderRadius: BorderRadius.circular(3)),
                  child: Text(cat, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 7.5, color: Color(0xFF9BE9E0))),
                ),
              ],
              const SizedBox(width: 4),
              const Text('🅰', style: TextStyle(fontSize: 9, color: Color(0xFF4ECDC4))),
              const SizedBox(width: 2),
              Flexible(flex: 2, child: _sideChip(itemId, true, pj, cfgA, drA, compact: true)),
              const SizedBox(width: 3),
              GestureDetector(
                onTap: () {
                  Telemetry.I.action('featured_use');
                  _useProject(pj, name);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(color: const Color(0xFFFFD24A), borderRadius: BorderRadius.circular(5)),
                  child: const Text('用此阵容', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 4),
          _featGroup('🅱 B组（队友）', const Color(0xFFF0932B), bHand, false, pj, w, itemId, cfgB, drB),
        ]),
      );
    });
  }

  /// 头部单行的小胶囊：A🚂走马·我方 51% —— 点击可改战车/减伤表
  Widget _sideChip(String itemId, bool isMine, Map<String, dynamic> pj, Map<String, dynamic> cfg, double? dr,
      {bool compact = false, String scope = 'feat'}) {
    final ch = cfg['chariot'] as Map<String, dynamic>;
    final table = cfg['table'] as String;
    final main = (ch['main'] as num?)?.toInt() ?? 0;
    final sub = (ch['sub'] as num?)?.toInt() ?? 0;
    final short = main > 0 ? AppData.chariotShort(main, sub) : '未设车';
    final color = isMine ? const Color(0xFF4ECDC4) : const Color(0xFFF0932B);
    return GestureDetector(
      onTap: () => _showFeatCfg(itemId, isMine, pj, scope: scope),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        decoration: BoxDecoration(
          color: color.withAlpha(20),
          borderRadius: BorderRadius.circular(5),
          border: Border.all(color: color.withAlpha(90)),
        ),
        child: Text(
          '${compact ? "" : (isMine ? "A" : "B")}🚂$short·$table ${(dr ?? 0).toStringAsFixed(1)}%',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: compact ? 7.5 : 8, fontWeight: FontWeight.bold, color: color),
        ),
      ),
    );
  }

  /// 🚂 某组设置：战车（主/副/等级/融合）+ 减伤表（本机保存，仅影响自己看到的数值）
  void _showFeatCfg(String itemId, bool isMine, Map<String, dynamic> pj, {String scope = 'feat'}) {
    final key = '${itemId}_${isMine ? "a" : "b"}';
    final cfg = _sideCfg(itemId, isMine, pj);
    final ch = Map<String, dynamic>.from(cfg['chariot'] as Map<String, dynamic>);
    var main = (ch['main'] as num?)?.toInt() ?? 1;
    var mainLv = ((ch['mainLv'] as num?)?.toInt() ?? 1).clamp(1, 20);
    var sub = (ch['sub'] as num?)?.toInt() ?? 0;
    var subLv = ((ch['subLv'] as num?)?.toInt() ?? 1).clamp(1, 20);
    var subF = ((ch['subFusion'] as num?)?.toInt() ?? 0).clamp(0, 3);
    var table = cfg['table'] as String;
    var applyAll = scope == 'act' ? GlobalCfg.actApplyAll : GlobalCfg.featApplyAll;
    final hand = ((isMine ? pj['myHandCards'] : pj['teammateHandCards']) as List?) ?? const [];

    showModalBottomSheet(
      context: context,
      backgroundColor: UiAlpha.bg(const Color(0xFF1A1A2E)),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) {
        Map<String, dynamic> buildCfg() => {
              'chariot': {'main': main, 'mainLv': mainLv, 'sub': sub, 'subLv': subLv, 'subFusion': subF},
              'table': table,
            };
        double curDr() {
          try {
            return DrSystem.breakdown(handCards: hand, tableName: table, chariot: buildCfg()['chariot'] as Map<String, dynamic>)['total'] ?? 0;
          } catch (_) { return 0; }
        }
        Widget row(String label, Widget child) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                SizedBox(width: 76, child: Text(label, style: const TextStyle(fontSize: 11, color: Colors.white60))),
                Expanded(child: child),
              ]),
            );
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('🚂 ${isMine ? "A组（我方）" : "B组（队友）"} 设置',
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
              const SizedBox(height: 2),
              Text('当前减伤：${curDr().toStringAsFixed(1)}%（本机设置，不影响别人）',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF7CFC9B))),
              CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                value: applyAll,
                title: Text(scope == 'act' ? '应用到全部活动天数（个别可再单独改）' : '应用到精选所有阵容（个别可再单独改）',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF7CFC9B))),
                onChanged: (v) => setSheet(() => applyAll = v ?? false),
              ),
              const SizedBox(height: 4),
              row('主战车', DropdownButton<int>(
                value: main,
                isExpanded: true,
                dropdownColor: const Color(0xFF1A1A2E),
                style: const TextStyle(fontSize: 11.5, color: Colors.white),
                items: [for (var i = 1; i <= AppData.chariotList.length; i++)
                  DropdownMenuItem(value: i, child: Text('$i. ${AppData.chariotName(i)}${AppData.chariotIsDr(i) ? " 🛡" : ""}'))],
                onChanged: (v) => setSheet(() { main = v ?? main; }),
              )),
              row('主车等级', DropdownButton<int>(
                value: mainLv,
                dropdownColor: const Color(0xFF1A1A2E),
                style: const TextStyle(fontSize: 11.5, color: Colors.white),
                items: [for (var i = 1; i <= 20; i++) DropdownMenuItem(value: i, child: Text('Lv$i'))],
                onChanged: (v) => setSheet(() { mainLv = v ?? mainLv; }),
              )),
              row('副战车', DropdownButton<int>(
                value: sub,
                isExpanded: true,
                dropdownColor: const Color(0xFF1A1A2E),
                style: const TextStyle(fontSize: 11.5, color: Colors.white),
                items: [
                  const DropdownMenuItem(value: 0, child: Text('未设置')),
                  for (var i = 1; i <= AppData.chariotList.length; i++)
                    DropdownMenuItem(value: i, child: Text('$i. ${AppData.chariotName(i)}${AppData.chariotIsDr(i) ? " 🛡" : ""}')),
                ],
                onChanged: (v) => setSheet(() { sub = v ?? 0; }),
              )),
              if (sub > 0) ...[
                row('副车等级', DropdownButton<int>(
                  value: subLv,
                  dropdownColor: const Color(0xFF1A1A2E),
                  style: const TextStyle(fontSize: 11.5, color: Colors.white),
                  items: [for (var i = 1; i <= 20; i++) DropdownMenuItem(value: i, child: Text('Lv$i'))],
                  onChanged: (v) => setSheet(() { subLv = v ?? subLv; }),
                )),
                row('副车融合', DropdownButton<int>(
                  value: subF,
                  dropdownColor: const Color(0xFF1A1A2E),
                  style: const TextStyle(fontSize: 11.5, color: Colors.white),
                  items: const [
                    DropdownMenuItem(value: 0, child: Text('50%（0次）')),
                    DropdownMenuItem(value: 1, child: Text('60%（1次）')),
                    DropdownMenuItem(value: 2, child: Text('70%（2次）')),
                    DropdownMenuItem(value: 3, child: Text('80%（3次）')),
                  ],
                  onChanged: (v) => setSheet(() { subF = v ?? 0; }),
                )),
              ],
              row('减伤表', Wrap(spacing: 6, runSpacing: 4, children: [
                for (final t in DrSystem.tables)
                  ChoiceChip(
                    label: Text(t, style: TextStyle(fontSize: 11, color: table == t ? const Color(0xFF07231F) : Colors.white70)),
                    selected: table == t,
                    selectedColor: const Color(0xFF2BB3A3),
                    backgroundColor: Colors.white.withAlpha(22),
                    onSelected: (_) => setSheet(() { table = t; }),
                  ),
                GestureDetector(
                  onTap: () {
                    Navigator.pop(ctx);
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const DrManagePage(initialTable: '我的')));
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(18),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: const Text('管理/新建 ›', style: TextStyle(fontSize: 10, color: Color(0xFF7CFC9B))),
                  ),
                ),
              ])),
              const SizedBox(height: 4),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      _featCfg.remove(key);
                      _saveFeatCfg();
                      if (mounted) setState(() {});
                      Navigator.pop(ctx);
                    },
                    child: const Text('恢复默认', style: TextStyle(fontSize: 12, color: Colors.white54)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2BB3A3)),
                    onPressed: () async {
                      _featCfg[key] = buildCfg();
                      await _saveFeatCfg();
                      await GlobalCfg.setSideCfg(scope, isMine, buildCfg());
                      await GlobalCfg.setApplyAll(scope, applyAll);
                      Telemetry.I.action('dr_cfg_save', {'scope': scope, 'applyAll': applyAll});
                      if (mounted) setState(() {});
                      Navigator.pop(ctx);
                    },
                    child: const Text('保存', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
                  ),
                ),
              ]),
            ]),
          ),
        );
      }),
    );
  }

  /// 精选卡也遵循「卡池设一次，全局默认」：只覆盖用户显式设置过的字段
  void _applyGlobalCardDefaults(CardData cd) {
    if (!GlobalCfg.cardApplyAll || cd.name.isEmpty) return;
    final official = AppData.officialName(cd.name);
    final def = globalHeroDefaults[official];
    if (def is! Map) return;
    if (def['lv'] != null) cd.level = def['lv'].toString();
    if (def['mohua'] != null) cd.hasMohua = def['mohua'] == true;
    final fusionName = def['fusion']?.toString() ?? '';
    if (fusionName.isNotEmpty) {
      final f = AppData.I.splitFusion(fusionName);
      if (f != null) {
        cd.name = fusionName;
        cd.fusion = f;
        cd.mainFile = SkinPack.I.skinFile(f[0], def['skin']?.toString() ?? '') ?? SkinPack.I.skinFile(f[0], '');
        cd.subFile = SkinPack.I.skinFile(f[1], '') ?? SkinPack.I.skinFileByName(f[1]);
        final sub = def['sub'];
        if (sub is Map) {
          cd.subLevel = sub['lv']?.toString() ?? '1';
          cd.subMohua = sub['mohua'] == true;
        }
      }
    } else {
      final sk = def['skin']?.toString() ?? '';
      if (sk.isNotEmpty) {
        cd.skinName = sk;
        cd.mainFile = SkinPack.I.skinFile(official, sk) ?? SkinPack.I.skinFileByAny(sk) ?? cd.mainFile;
      }
    }
    if (cd.mainFile != null) {
      try { cd.mainKey = cd.mainFile!.lastModifiedSync().millisecondsSinceEpoch.toString(); } catch (_) {}
    }
  }

  /// 一组 5×2 = 10 张卡（皮肤图 + 等级盾）；标题行右侧跟战车·减伤表·减伤%胶囊
  Widget _featGroup(String label, Color color, List hand, bool isMine,
      Map<String, dynamic> pj, double w, String itemId, Map<String, dynamic> cfg, double? dr,
      {Widget? titleOverride}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      titleOverride ?? Row(children: [
        Text(label, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: color)),
        const SizedBox(width: 6),
        Flexible(child: _sideChip(itemId, isMine, pj, cfg, dr)),
      ]),
      const SizedBox(height: 2),
      for (var r = 0; r < 2; r++)
        Padding(
          padding: EdgeInsets.only(top: r > 0 ? 2 : 0),
          child: Row(children: [
            for (var c = 0; c < 5; c++)
              Padding(
                padding: EdgeInsets.only(right: c < 4 ? 3 : 0),
                child: Builder(builder: (_) {
                  final idx = r * 5 + c;
                  if (idx >= hand.length) {
                    return Container(
                      width: w, height: w * 0.92,
                      decoration: BoxDecoration(
                        color: Colors.white.withAlpha(9),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    );
                  }
                  // 单卡异常不能毁掉整组（数据可能有脏字段）
                  CardData cd;
                  try {
                    cd = parseCard(hand[idx], isMine, pj, pack: SkinPack.I);
                    _applyGlobalCardDefaults(cd);
                  } catch (_) {
                    cd = CardData();
                  }
                  return CardSlot(data: cd, size: w);
                }),
              ),
          ]),
        ),
    ]);
  }

  List<String> _names(dynamic hand) {
    final out = <String>[];
    if (hand is List) {
      for (final c in hand) {
        out.add(c is Map ? (c['name']?.toString() ?? '') : c.toString());
      }
    }
    return out;
  }

  Future<void> _useProject(Map<String, dynamic> pj, String name) async {
    final p = Map<String, dynamic>.from(pj);
    p['name'] = name;
    await ProjectLibrary.addProject(pj['category']?.toString() ?? '我的', name, p);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已创建本地项目：$name（主页切到本地可见）')));
    }
  }

  // ------------------------------------------------------------ 🏆 活动
  Widget _activity() {
    final act = (AppData.I.lineupLib?['activity'] as List?) ?? [];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
          child: Text('🏆 迷城每日轮转 · 双人 A/B（${act.length} 天）', style: const TextStyle(fontSize: 9.5, color: Color(0xFF9AA4B8)))),
      for (var i = 0; i < act.length; i++) _activityCard(act[i] as Map<String, dynamic>, i),
    ]);
  }

  Widget _activityCard(Map<String, dynamic> a, int i) {
    final day = a['day'] ?? i + 1;
    final aH = (a['A'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final bH = (a['B'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final fakePj = <String, dynamic>{
      'myHandCards': [for (final n in aH) {'name': n}],
      'teammateHandCards': [for (final n in bH) {'name': n}],
    };
    final itemId = 'act_$i';
    final cfgA = _sideCfg(itemId, true, fakePj);
    final cfgB = _sideCfg(itemId, false, fakePj);
    double? drA, drB;
    try {
      drA = DrSystem.breakdown(handCards: fakePj['myHandCards'] as List, tableName: cfgA['table'] as String,
          chariot: cfgA['chariot'] as Map<String, dynamic>)['total'];
    } catch (_) {}
    try {
      drB = DrSystem.breakdown(handCards: fakePj['teammateHandCards'] as List, tableName: cfgB['table'] as String,
          chariot: cfgB['chariot'] as Map<String, dynamic>)['total'];
    } catch (_) {}
    return Container(
      margin: const EdgeInsets.only(bottom: 7),
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(color: UiAlpha.bg(const Color(0xFF15152A)), borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('📜 活动第 $day 天 · 双人 A/B', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
        const SizedBox(height: 4),
        _heroGroup('🅰 A 组（我方）', const Color(0xFF4ECDC4), aH,
            chip: _sideChip(itemId, true, fakePj, cfgA, drA, scope: 'act')),
        _heroGroup('🅱 B 组（队友）', const Color(0xFFF0932B), bH,
            chip: _sideChip(itemId, false, fakePj, cfgB, drB, scope: 'act')),
      ]),
    );
  }

  // ------------------------------------------------------------ 🚢 大航海
  Widget _sailing() {
    final sail = (AppData.I.lineupLib?['sailing'] as List?) ?? [];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
          child: Text('🚢 大航海固定卡组 · 共 ${sail.length} 套 · 点行展开卡图', style: const TextStyle(fontSize: 9.5, color: Color(0xFF9AA4B8)))),
      for (var i = 0; i < sail.length; i++) _sailingRow(sail[i] as Map<String, dynamic>, i),
    ]);
  }

  Widget _sailingRow(Map<String, dynamic> s, int i) {
    final n = s['n'] ?? i + 1;
    final w = s['w'] ?? 0;
    final heroes = (s['heroes'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final open = expandedSailing.contains(n);
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(color: UiAlpha.bg(const Color(0xFF15152A)), borderRadius: BorderRadius.circular(8)),
      child: Column(children: [
        GestureDetector(
          onTap: () => setState(() { open ? expandedSailing.remove(n) : expandedSailing.add(n); }),
          child: Row(children: [
            SizedBox(width: 30, child: Text('$n', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4)))),
            Expanded(child: Text(heroes.take(5).join('·') + (heroes.length > 5 ? '…' : ''),
                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 9.5, color: Color(0xFFCFD6E6)))),
            if (w > 0) Text('$w波', style: const TextStyle(fontSize: 9, color: Color(0xFFFF8A80))),
          ]),
        ),
        if (open) _heroGroup('固定卡组', const Color(0xFF4ECDC4), heroes),
      ]),
    );
  }

  // ------------------------------------------------------------ 一组 10 卡（5列×2排）
  Widget _heroGroup(String title, Color accent, List<String> heroes, {Widget? chip}) {
    final w = MediaQuery.of(context).size.width - 10 - 10 - 10;
    final gap = 2.0;
    final cw = (w - gap * 4) / 5;
    final ch = cw * 0.92;
    return Container(
      margin: const EdgeInsets.only(top: 5),
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(color: accent.withAlpha(20), borderRadius: BorderRadius.circular(8), border: Border.all(color: accent.withAlpha(50))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Flexible(child: Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: accent),
              overflow: TextOverflow.ellipsis)),
          if (chip != null) ...[
            const SizedBox(width: 6),
            Flexible(child: chip),
          ],
        ]),
        const SizedBox(height: 2),
        for (var r = 0; r < 2; r++)
          Padding(
            padding: EdgeInsets.only(top: r > 0 ? gap : 0),
            child: Row(children: [
              for (var c = 0; c < 5; c++)
                Padding(
                  padding: EdgeInsets.only(left: c > 0 ? gap : 0),
                  child: Builder(builder: (_) {
                    final idx = r * 5 + c;
                    final nm = idx < heroes.length ? heroes[idx] : '';
                    final cd = nm.isEmpty ? CardData() : buildLibCard(nm);
                    return GestureDetector(
                      onTap: () { if (!cd.isEmpty) showLibSettings(cd, nm); },
                      child: CardSlot(data: cd, size: cw),
                    );
                  }),
                ),
            ]),
          ),
      ]),
    );
  }

  /// 图库卡渲染：应用图库个人设置（等级/皮肤/魔化/融合）
  CardData buildLibCard(String heroName) {
    final d = CardData();
    d.name = heroName;
    final hs = libSettings()[heroName];
    var displayName = heroName;
    if (hs != null && (hs as Map)['fusion']?.toString().isNotEmpty == true) displayName = hs['fusion'].toString();
    final official = AppData.officialName(displayName);
    final f = AppData.I.splitFusion(displayName);
    final pc = AppData.I.poolByName[f != null ? f[0] : official];
    d.cardType = pc?.type ?? 'gold';
    d.prof = pc?.prof ?? 'warrior';
    d.isEngineering = pc?.eng ?? false;
    d.level = hs != null && hs['lv'] != null ? hs['lv'].toString() : '1';
    d.hasMohua = hs != null && hs['mohua'] == true;
    d.filled = true;
    final skin = hs != null ? hs['skin']?.toString() ?? '' : '';
    final mainHero = f != null ? f[0] : official;
    var main = skin.isEmpty ? SkinPack.I.skinFile(mainHero, '') : (SkinPack.I.skinFile(mainHero, skin) ?? SkinPack.I.skinFileByAny(skin) ?? SkinPack.I.skinFile(mainHero, ''));
    d.mainFile = main ?? SkinPack.I.skinFileByName(heroName);
    if (f != null) {
      d.fusion = f;
      d.subFile = SkinPack.I.skinFile(f[1], '');
      final sub = hs != null ? hs['sub'] as Map? : null;
      d.subLevel = sub != null ? (sub['lv']?.toString() ?? '1') : '1';
      d.subMohua = sub != null && sub['mohua'] == true;
    }
    return d;
  }

  Map<String, dynamic> libSettings() {
    // 全局默认开启时，卡池里的设置覆盖本页单独设置
    if (!GlobalCfg.cardApplyAll) return _libSettingsCache;
    final merged = <String, dynamic>{..._libSettingsCache};
    for (final entry in globalHeroDefaults.entries) {
      merged[entry.key] = entry.value;
    }
    return merged;
  }

  Future<void> _commitLibSetting(String heroName, Map<String, dynamic> hs) async {
    _libSettingsCache[heroName] = hs;
    if (GlobalCfg.cardApplyAll) {
      globalHeroDefaults[heroName] = hs;
      await PoolSheetState.saveHeroDefaults();
    }
  }

  /// 图库卡设置面板（等级/皮肤/魔化/融合）
  void showLibSettings(CardData cd, String heroName) {
    final st = _libSettingsCache;
    var hs = st[heroName] as Map<String, dynamic>? ?? {};
    final official = AppData.officialName(heroName);
    var fusion = hs['fusion']?.toString().isNotEmpty == true ? AppData.I.splitFusion(hs['fusion']) : null;
    final baseHero = fusion != null ? fusion[0] : official;
    final pc = AppData.I.poolByName[baseHero];
    final type = pc?.type ?? 'gold';
    final levels = AppData.availableLevels(type);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: UiAlpha.bg(const Color(0xFF16162C)),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SingleChildScrollView(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('⚙️ $heroName', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
                CheckboxListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  value: GlobalCfg.cardApplyAll,
                  title: const Text('应用到所有阵容（卡池/精选/活动）', style: TextStyle(fontSize: 11, color: Color(0xFF7CFC9B))),
                  onChanged: (v) async {
                    await GlobalCfg.setCardApplyAll(v ?? false);
                    if (v == true) await _commitLibSetting(heroName, hs);
                    setSheet(() {});
                    setState(() {});
                  },
                ),
                const SizedBox(height: 4),
                Text('📊 等级：Lv ${hs['lv'] ?? 1}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
                Slider(
                  min: 0, max: (levels.length - 1).toDouble(), divisions: levels.length - 1,
                  value: () {
                    final i = levels.indexOf(int.tryParse(hs['lv']?.toString() ?? '1') ?? 1);
                    return (i < 0 ? 0 : i).toDouble();
                  }(),
                  activeColor: const Color(0xFF4ECDC4),
                  onChanged: (_) {},
                  onChangeEnd: (v) { hs['lv'] = '${levels[v.round()]}'; _commitLibSetting(heroName, hs); setSheet(() {}); setState(() {}); },
                ),
                const Text('🎨 皮肤', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFF9800))),
                SizedBox(
                  height: 60,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final sk in SkinPack.I.skinsOfHero(baseHero))
                        GestureDetector(
                          onTap: () { hs['skin'] = '默认' == sk ? '' : sk; _commitLibSetting(heroName, hs); setSheet(() {}); setState(() {}); },
                          child: Container(
                            width: 50, height: 50, margin: const EdgeInsets.only(right: 5), padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: (('默认' == sk && (hs['skin']?.toString() ?? '').isEmpty) || sk == hs['skin']) ? const Color(0xFFFFD24A) : Colors.white.withAlpha(50),
                              borderRadius: BorderRadius.circular(7)),
                            child: FutureBuilder<File?>(
                              future: Future(() => '默认' == sk ? SkinPack.I.skinFile(baseHero, '') : (SkinPack.I.skinFile(baseHero, sk) ?? SkinPack.I.skinFileByAny(sk))),
                              builder: (_, s2) => s2.data != null ? ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.file(s2.data!, fit: BoxFit.cover, cacheWidth: 100, cacheHeight: 100)) : const SizedBox(),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: () { hs['mohua'] = !(hs['mohua'] == true); _commitLibSetting(heroName, hs); setSheet(() {}); setState(() {}); },
                  child: Container(
                    width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                    decoration: BoxDecoration(color: hs['mohua'] == true ? const Color(0xFF7C4BC0) : Colors.white.withAlpha(50), borderRadius: BorderRadius.circular(8)),
                    child: Text(hs['mohua'] == true ? '👹 魔化已开启' : '👹 魔化未开启', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
                  ),
                ),
                const SizedBox(height: 8),
                const Text('🔗 融合变体', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF9BE9E0))),
                for (final p in AppData.I.fusionVariantsOf(baseHero))
                  if (p[0] + p[1] != (fusion != null ? fusion[0] + fusion[1] : heroName))
                    GestureDetector(
                      onTap: () { hs['fusion'] = p[0] + p[1]; _commitLibSetting(heroName, hs); setSheet(() {}); setState(() {}); },
                      child: Container(
                        width: double.infinity, margin: const EdgeInsets.only(top: 5), padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                        decoration: BoxDecoration(color: const Color(0x332BB3A3), borderRadius: BorderRadius.circular(8)),
                        child: Text('${fusion != null ? "换成" : "+"} ${p[1]} → ${p[0] + p[1]}', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
                      ),
                    ),
                if (fusion != null)
                  GestureDetector(
                    onTap: () { hs['fusion'] = ''; _commitLibSetting(heroName, hs); setSheet(() {}); setState(() {}); },
                    child: Container(
                      width: double.infinity, margin: const EdgeInsets.only(top: 5), padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                      decoration: BoxDecoration(color: Colors.white.withAlpha(70), borderRadius: BorderRadius.circular(8)),
                      child: const Text('✕ 不融合', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
                    ),
                  ),
                const SizedBox(height: 8),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

final Map<String, dynamic> _libSettingsCache = {};
