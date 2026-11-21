import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'models.dart';
import 'data_store.dart';
import 'card_widget.dart';

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

  @override
  void initState() {
    super.initState();
    _loadFeatured();
  }

  Future<void> _loadFeatured() async {
    // 精选阵容在线 Gist（匿名可读）
    const gid = 'eba2aa1c41025fd2ff5beecff2668c3f';
    try {
      final r = await httpGet('https://api.github.com/gists/$gid');
      if (r != null) {
        final d = jsonDecode(r) as Map<String, dynamic>;
        final files = d['files'] as Map<String, dynamic>;
        var f = files['featured_lineups.json'] as Map<String, dynamic>?;
        if (f != null) {
          var txt = f['content'].toString();
          if (f['truncated'] == true) txt = (await httpGet(f['raw_url'].toString())) ?? '';
          final j = jsonDecode(txt) as Map<String, dynamic>;
          if ((j['items'] as List?)?.isNotEmpty == true && mounted) setState(() => featured = j);
        }
      }
    } catch (_) {}
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
      const Padding(padding: EdgeInsets.symmetric(horizontal: 3, vertical: 4),
          child: Text('⭐ 精选阵容（在线资源）· 点卡调设置 · 「用此阵容」导入项目', style: TextStyle(fontSize: 9.5, color: Color(0xFF9AA4B8)))),
      if (items.isEmpty) const Padding(padding: EdgeInsets.all(20), child: Center(child: Text('精选阵容加载中…', style: TextStyle(color: Colors.white38)))),
      for (final itRaw in items) _featuredCard(itRaw as Map<String, dynamic>),
    ]);
  }

  Widget _featuredCard(Map<String, dynamic> it) {
    final pj = it['data'];
    if (pj is! Map<String, dynamic>) return const SizedBox();
    final name = it['name']?.toString() ?? '未命名';
    final cat = it['category']?.toString() ?? '';
    final aNames = _names(pj['myHandCards']);
    final bNames = _names(pj['teammateHandCards']);
    return Container(
      margin: const EdgeInsets.only(bottom: 7),
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
          const Spacer(),
          if (cat.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(color: const Color(0x332BB3A3), borderRadius: BorderRadius.circular(5)),
              child: Text(cat, style: const TextStyle(fontSize: 9, color: Color(0xFF9BE9E0))),
            ),
          const SizedBox(width: 5),
          GestureDetector(
            onTap: () => _useProject(pj, name),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(color: const Color(0xFFFFD24A), borderRadius: BorderRadius.circular(6)),
              child: const Text('📋 用此阵容', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        _heroGroup('🅰 A 组', const Color(0xFF4ECDC4), aNames),
        _heroGroup('🅱 B 组', const Color(0xFFF0932B), bNames),
      ]),
    );
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
