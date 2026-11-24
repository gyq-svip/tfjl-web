import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';
import 'data_store.dart';
import 'card_widget.dart';
import 'dr_system.dart';

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

  @override
  void initState() {
    super.initState();
    _initLoad();
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
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C17),
      body: SafeArea(
        child: Column(children: [
          Container(
            color: const Color(0xFF12122A),
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
    final aHand = (pj['myHandCards'] as List?) ?? const [];
    final bHand = (pj['teammateHandCards'] as List?) ?? const [];
    final ca = pj['myChariot'] is Map ? Map<String, dynamic>.from(pj['myChariot'] as Map) : null;
    final cb = pj['teammateChariot'] is Map ? Map<String, dynamic>.from(pj['teammateChariot'] as Map) : null;
    double? drA, drB;
    try { drA = DrSystem.breakdown(handCards: aHand, tableName: '我的', chariot: ca)['total']; } catch (_) {}
    try { drB = DrSystem.breakdown(handCards: bHand, tableName: '队友', chariot: cb)['total']; } catch (_) {}
    String chOf(Map<String, dynamic>? c) {
      if (c == null) return '';
      try {
        return AppData.chariotShort((c['main'] as num?)?.toInt() ?? 1, (c['sub'] as num?)?.toInt() ?? 0);
      } catch (_) { return ''; }
    }
    return LayoutBuilder(builder: (ctx, cs) {
      const gap = 3.0;
      final w = ((cs.maxWidth - 14 - gap * 4) / 5).clamp(26.0, 74.0);
      return Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(7),
        decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(10)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A)))),
            const SizedBox(width: 5),
            if (cat.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(color: const Color(0x332BB3A3), borderRadius: BorderRadius.circular(5)),
                child: Text(cat, style: const TextStyle(fontSize: 9, color: Color(0xFF9BE9E0))),
              ),
            const Spacer(),
            GestureDetector(
              onTap: () => _useProject(pj, name),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(color: const Color(0xFFFFD24A), borderRadius: BorderRadius.circular(6)),
                child: const Text('📋 用此阵容', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
              ),
            ),
          ]),
          const SizedBox(height: 5),
          _featGroup('🅰 A组（我方）', const Color(0xFF4ECDC4), aHand, true, pj, w, chOf(ca), drA),
          const SizedBox(height: 5),
          _featGroup('🅱 B组（队友）', const Color(0xFFF0932B), bHand, false, pj, w, chOf(cb), drB),
        ]),
      );
    });
  }

  /// 一组 5×2 = 10 张卡（皮肤图 + 等级盾），标题行带战车与减伤%
  Widget _featGroup(String label, Color color, List hand, bool isMine,
      Map<String, dynamic> pj, double w, String chariot, double? dr) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(label, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: color)),
        const SizedBox(width: 6),
        if (chariot.isNotEmpty)
          Text('🚂$chariot', style: const TextStyle(fontSize: 8.5, color: Color(0xFF9AA4B8))),
        if (dr != null) ...[
          const SizedBox(width: 6),
          Text('🛡${dr.toStringAsFixed(1)}%', style: const TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: Color(0xFF7CFC9B))),
        ],
      ]),
      const SizedBox(height: 3),
      for (var r = 0; r < 2; r++)
        Padding(
          padding: EdgeInsets.only(top: r > 0 ? 3 : 0),
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
                  final cd = parseCard(hand[idx], isMine, pj, pack: SkinPack.I);
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
    return Container(
      margin: const EdgeInsets.only(bottom: 7),
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('📜 活动第 $day 天 · 双人 A/B', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
        const SizedBox(height: 4),
        _heroGroup('🅰 A 组（我方）', const Color(0xFF4ECDC4), aH),
        _heroGroup('🅱 B 组（队友）', const Color(0xFFF0932B), bH),
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
      decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(8)),
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
  Widget _heroGroup(String title, Color accent, List<String> heroes) {
    final w = MediaQuery.of(context).size.width - 10 - 10 - 10;
    final gap = 2.0;
    final cw = (w - gap * 4) / 5;
    final ch = cw * 0.92;
    return Container(
      margin: const EdgeInsets.only(top: 5),
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(color: accent.withAlpha(20), borderRadius: BorderRadius.circular(8), border: Border.all(color: accent.withAlpha(50))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: accent)),
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
    // 简化：用静态内存（会话内）——持久化走 shared_prefs 由设置面板写
    return _libSettingsCache;
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
      backgroundColor: const Color(0xFF16162C),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SingleChildScrollView(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('⚙️ $heroName', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
                const SizedBox(height: 8),
                Text('📊 等级：Lv ${hs['lv'] ?? 1}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
                Slider(
                  min: 0, max: (levels.length - 1).toDouble(), divisions: levels.length - 1,
                  value: () {
                    final i = levels.indexOf(int.tryParse(hs['lv']?.toString() ?? '1') ?? 1);
                    return (i < 0 ? 0 : i).toDouble();
                  }(),
                  activeColor: const Color(0xFF4ECDC4),
                  onChanged: (_) {},
                  onChangeEnd: (v) { hs['lv'] = '${levels[v.round()]}'; st[heroName] = hs; setSheet(() {}); setState(() {}); },
                ),
                const Text('🎨 皮肤', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFF9800))),
                SizedBox(
                  height: 60,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final sk in SkinPack.I.skinsOfHero(baseHero))
                        GestureDetector(
                          onTap: () { hs['skin'] = '默认' == sk ? '' : sk; st[heroName] = hs; setSheet(() {}); setState(() {}); },
                          child: Container(
                            width: 50, height: 50, margin: const EdgeInsets.only(right: 5), padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: (('默认' == sk && (hs['skin']?.toString() ?? '').isEmpty) || sk == hs['skin']) ? const Color(0xFFFFD24A) : Colors.white.withAlpha(50),
                              borderRadius: BorderRadius.circular(7)),
                            child: FutureBuilder<File?>(
                              future: Future(() => '默认' == sk ? SkinPack.I.skinFile(baseHero, '') : (SkinPack.I.skinFile(baseHero, sk) ?? SkinPack.I.skinFileByAny(sk))),
                              builder: (_, s2) => s2.data != null ? ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.file(s2.data!, fit: BoxFit.cover)) : const SizedBox(),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: () { hs['mohua'] = !(hs['mohua'] == true); st[heroName] = hs; setSheet(() {}); setState(() {}); },
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
                      onTap: () { hs['fusion'] = p[0] + p[1]; st[heroName] = hs; setSheet(() {}); setState(() {}); },
                      child: Container(
                        width: double.infinity, margin: const EdgeInsets.only(top: 5), padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                        decoration: BoxDecoration(color: const Color(0x332BB3A3), borderRadius: BorderRadius.circular(8)),
                        child: Text('${fusion != null ? "换成" : "+"} ${p[1]} → ${p[0] + p[1]}', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
                      ),
                    ),
                if (fusion != null)
                  GestureDetector(
                    onTap: () { hs['fusion'] = ''; st[heroName] = hs; setSheet(() {}); setState(() {}); },
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
