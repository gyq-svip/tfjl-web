import 'dart:convert';
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/material.dart';
import 'models.dart';
import 'data_store.dart';
import 'card_widget.dart';

/// 全局英雄默认配置（官方英雄名 → {lv,skin,mohua,fusion,sub:{lv,skin,mohua}}）
Map<String, dynamic> globalHeroDefaults = {};

/// 🎴 卡池 bottom sheet：品质大类 tab → 职业分组 → 皮肤图标
/// 点卡 = 加手牌 + 自动上阵；长按 = 英雄默认设置（等级/皮肤/魔化/融合，本地保存）
class PoolSheet extends StatefulWidget {
  final bool isMine;
  final Map<String, dynamic> proj;
  final VoidCallback onAdded;
  final bool embedded;                    // 嵌入悬浮面板（无外层 Scaffold/标题）
  final VoidCallback? onSwitchSide;       // 切换我方/队友
  const PoolSheet({required this.isMine, required this.proj, required this.onAdded,
      this.embedded = false, this.onSwitchSide});

  @override
  State<PoolSheet> createState() => PoolSheetState();
}

class PoolSheetState extends State<PoolSheet> {
  int catIdx = 0;
  static const cats = [
    ['gold', '🥇 金卡类'], ['purple', '🥈 紫卡类'], ['blue', '🥉 蓝卡类'], ['green', '🌿 绿卡类'],
  ];
  static const profOrder = ['warrior', 'mage', 'archer', 'summoner', 'priest', 'warlock', 'panda', 'pokeball', 'engineering'];

  @override
  void initState() {
    super.initState();
    _loadDefaults();
  }

  Future<void> _loadDefaults() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      globalHeroDefaults = jsonDecode(prefs.getString('hero_defaults') ?? '{}') as Map<String, dynamic>;
    } catch (_) { globalHeroDefaults = {}; }
    if (mounted) setState(() {});
  }

  /// 卡池预设改动后立刻落盘（之前只改内存不保存 → 退出全丢）
  static Future<void> saveHeroDefaults() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('hero_defaults', jsonEncode(globalHeroDefaults));
  }

  /// 长按卡池卡：该英雄的默认配置面板（官方融合变体 + 官方魔化判定，本地保存）
  void showHeroDefaultsSheet(String heroName) {
    final official = AppData.officialName(heroName);
    final pc = AppData.I.poolByName[official];
    final type = pc?.type ?? 'gold';
    final levels = AppData.availableLevels(type);
    final hs = (globalHeroDefaults[official] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final fusion = hs['fusion']?.toString().isNotEmpty == true ? AppData.I.splitFusion(hs['fusion']) : null;
    final baseHero = fusion != null ? fusion[0] : official;
    final hasMh = SkinPack.I.hasMohuaData(baseHero);
    var curLv = int.tryParse(hs['lv']?.toString() ?? '1') ?? 1;
    var lvIdx = levels.indexOf(curLv); if (lvIdx < 0) lvIdx = 0;
    var subLv = 1;
    if (hs['sub'] is Map) subLv = int.tryParse((hs['sub'] as Map)['lv']?.toString() ?? '1') ?? 1;
    List<int> subLevels = const [1, 3, 6, 9, 12, 15, 18, 21, 24];
    var subIdx = 0;

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
                Text('⚙️ $official（默认配置）',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
                const Text('加卡/新建阵容时自动套用', style: TextStyle(fontSize: 9.5, color: Colors.white38)),
                const SizedBox(height: 8),
                Text('📊 等级：Lv ${levels[lvIdx]}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
                Slider(
                  min: 0, max: (levels.length - 1).toDouble(), divisions: levels.length - 1, value: lvIdx.toDouble(),
                  activeColor: const Color(0xFF4ECDC4),
                  onChanged: (v) => setSheet(() => lvIdx = v.round()),
                  onChangeEnd: (v) { lvIdx = v.round(); hs['lv'] = '${levels[lvIdx]}'; globalHeroDefaults[official] = hs; saveHeroDefaults(); setSheet(() {}); },
                ),
                const Text('🎨 皮肤', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFF9800))),
                SizedBox(
                  height: 60,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final sk in SkinPack.I.skinsOfHero(baseHero))
                        GestureDetector(
                          onTap: () { hs['skin'] = '默认' == sk ? '' : sk; globalHeroDefaults[official] = hs; saveHeroDefaults(); setSheet(() {}); },
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
                if (hasMh)
                  GestureDetector(
                    onTap: () { hs['mohua'] = !(hs['mohua'] == true); globalHeroDefaults[official] = hs; saveHeroDefaults(); setSheet(() {}); },
                    child: Container(
                      width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                      decoration: BoxDecoration(color: hs['mohua'] == true ? const Color(0xFF7C4BC0) : Colors.white.withAlpha(50), borderRadius: BorderRadius.circular(8)),
                      child: Text(hs['mohua'] == true ? '👹 魔化已开启' : '👹 魔化未开启',
                          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
                    ),
                  )
                else
                  Container(
                    width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                    decoration: BoxDecoration(color: Colors.white.withAlpha(24), borderRadius: BorderRadius.circular(8)),
                    child: const Text('👹 该英雄无魔化', style: TextStyle(fontSize: 11.5, color: Colors.white38)),
                  ),
                const SizedBox(height: 8),
                const Text('🔗 融合变体（官方）', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF9BE9E0))),
                if (fusion != null)
                  GestureDetector(
                    onTap: () { hs['fusion'] = ''; globalHeroDefaults[official] = hs; saveHeroDefaults(); setSheet(() {}); },
                    child: Container(
                      width: double.infinity, margin: const EdgeInsets.only(top: 5), padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                      decoration: BoxDecoration(color: Colors.white.withAlpha(70), borderRadius: BorderRadius.circular(8)),
                      child: const Text('✕ 不融合', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
                    ),
                  ),
                for (final p in AppData.I.fusionVariantsOf(baseHero))
                  if (p[0] + p[1] != (fusion != null ? fusion[0] + fusion[1] : heroName))
                    GestureDetector(
                      onTap: () {
                        hs['fusion'] = p[0] + p[1];
                        globalHeroDefaults[official] = hs;
                        saveHeroDefaults();
                        // 联动刷新：副卡档位/魔化按新副卡重算（面板内完成）
                        final newF = AppData.I.splitFusion(p[0] + p[1]);
                        if (newF != null) {
                          final st = AppData.I.poolByName[newF[1]]?.type ?? 'gold';
                          subLevels = AppData.availableLevels(st);
                          subIdx = 0;
                        }
                        setSheet(() {});
                      },
                      child: Container(
                        width: double.infinity, margin: const EdgeInsets.only(top: 5), padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                        decoration: BoxDecoration(color: const Color(0x332BB3A3), borderRadius: BorderRadius.circular(8)),
                        child: Text('${fusion != null ? "换成" : "+"} ${p[1]} → ${p[0] + p[1]}', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
                      ),
                    ),
                if (fusion != null) ...[
                  const SizedBox(height: 6),
                  Text('📊 副卡等级：Lv ${subLevels[subIdx]}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
                  Slider(
                    min: 0, max: (subLevels.length - 1).toDouble(), divisions: subLevels.length - 1, value: subIdx.toDouble(),
                    activeColor: const Color(0xFF4ECDC4),
                    onChanged: (v) => setSheet(() => subIdx = v.round()),
                    onChangeEnd: (v) {
                      subIdx = v.round();
                      final sub = (hs['sub'] as Map<String, dynamic>?) ?? <String, dynamic>{};
                      sub['lv'] = '${subLevels[subIdx]}';
                      hs['sub'] = sub;
                      globalHeroDefaults[official] = hs;
                      saveHeroDefaults();
                      setSheet(() {});
                    },
                  ),
                ],
                const SizedBox(height: 10),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context);
    return SizedBox(
      height: widget.embedded ? double.infinity : h.size.height * 0.72,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(children: [
            if (!widget.embedded)
              Text('🎴 卡池 · 点卡加入${widget.isMine ? "我的" : "队友"}手牌并上阵',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
            if (widget.embedded)
              Text('${widget.isMine ? "👤 我的" : "🎭 队友"}手牌',
                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold,
                      color: widget.isMine ? const Color(0xFF67D2F5) : const Color(0xFFC79BF0))),
            const Spacer(),
            if (widget.embedded && widget.onSwitchSide != null)
              GestureDetector(
                onTap: widget.onSwitchSide,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(color: const Color(0xFF2BB3A3), borderRadius: BorderRadius.circular(5)),
                  child: const Text('切换我方/队友', style: TextStyle(fontSize: 9, color: Color(0xFF07231F))),
                ),
              ),
          ]),
        ),
        // 品质 tab
        Row(children: [
          for (var i = 0; i < cats.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => catIdx = i),
                child: Container(
                  margin: EdgeInsets.only(left: i > 0 ? 4 : 0),
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: catIdx == i ? const Color(0xFFFFD24A) : Colors.white.withAlpha(35),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(cats[i][1],
                      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold,
                          color: catIdx == i ? const Color(0xFF0C0C17) : const Color(0xFFCFD6E6))),
                ),
              ),
            ),
        ]),
        const SizedBox(height: 6),
        Expanded(child: _grid()),
      ]),
    );
  }

  Widget _grid() {
    final cat = cats[catIdx][0];
    final byProf = <String, List<PoolCard>>{};
    for (final c in AppData.I.pool) {
      final cc = c.cat == cat || c.type == cat;
      if (!cc) continue;
      byProf.putIfAbsent(c.prof, () => []).add(c);
    }
    // 官方融合卡并入对应品质/职业（与网页一致，作为独立卡显示）
    for (final fc in AppData.I.fusionCards) {
      final cc = fc.cat == cat || fc.type == cat;
      if (!cc) continue;
      byProf.putIfAbsent(fc.prof, () => []).add(fc);
    }
    final profs = profOrder.where(byProf.containsKey).toList();
    for (final p in byProf.keys) {
      if (!profs.contains(p)) profs.add(p);
    }
    if (profs.isEmpty) return const Center(child: Text('该分类暂无卡', style: TextStyle(color: Colors.white38)));

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      itemCount: profs.length,
      itemBuilder: (_, pi) {
        final prof = profs[pi];
        final cards = byProf[prof]!;
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 7, bottom: 3, left: 2),
            child: Text('▸ ${AppData.profName(prof)}（${cards.length}）',
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF9BE9E0))),
          ),
          for (var r = 0; r < (cards.length + 3) ~/ 4; r++)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(children: [
                for (var c = 0; c < 4; c++)
                  Expanded(
                    child: r * 4 + c < cards.length
                        ? Padding(
                            padding: EdgeInsets.only(left: c > 0 ? 4 : 0),
                            child: _poolCell(cards[r * 4 + c]),
                          )
                        : const SizedBox(),
                  ),
              ]),
          ),
        ]);
      },
    );
  }

  /// 卡池卡：完整渲染（预设的等级/魔化/融合形态直接显示）
  Widget _poolCell(PoolCard c) {
    final official = AppData.officialName(c.name);
    // 融合卡自身就是融合形态；基础卡用预设里的融合形态
    final selfFusion = AppData.I.splitFusion(c.name);
    final def = globalHeroDefaults[official] as Map<String, dynamic>?;
    final presetFusion = (def != null && def['fusion']?.toString().isNotEmpty == true)
        ? def['fusion'].toString() : null;
    final displayName = selfFusion != null ? c.name : (presetFusion ?? official);
    final cd = CardData();
    cd.name = displayName;
    cd.cardType = c.type;
    cd.prof = c.prof;
    cd.isEngineering = c.eng;
    cd.filled = true;
    cd.level = def != null ? (def['lv']?.toString() ?? '1') : '1';
    cd.hasMohua = def != null && def['mohua'] == true;
    final f = AppData.I.splitFusion(displayName);
    if (f != null) {
      cd.fusion = f;
      cd.mainFile = SkinPack.I.skinFile(f[0], (def?['skin'] ?? '').toString());
      cd.subFile = SkinPack.I.skinFile(f[1], '');
      final sub = def?['sub'] as Map<String, dynamic>?;
      cd.subLevel = sub != null ? (sub['lv']?.toString() ?? '1') : '1';
      cd.subMohua = sub != null && sub['mohua'] == true;
    } else {
      final skin = def != null ? def['skin']?.toString() ?? '' : '';
      cd.mainFile = skin.isEmpty ? SkinPack.I.skinFile(official, '') : (SkinPack.I.skinFile(official, skin) ?? SkinPack.I.skinFileByAny(skin) ?? SkinPack.I.skinFile(official, ''));
    }
    cd.mainFile ??= SkinPack.I.skinFileByName(c.name);
    if (cd.mainFile != null) {
      final m = cd.mainFile!;
      cd.mainKey = '${m.path}\${m.lastModifiedSync().millisecondsSinceEpoch}';
    }
    return GestureDetector(
      onTap: () { addToHand(c, false); },
      onLongPress: () { showHeroDefaultsSheet(c.name); },
      child: Column(children: [
        CardSlot(data: cd, size: 52),
        const SizedBox(height: 2),
        Text(displayName, maxLines: 1, overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 9, color: Color(0xFFEAF4FF))),
      ]),
    );
  }

  Future<File?> _iconFile(String hero) async {
    await SkinPack.I.ensurePack();
    return SkinPack.I.skinFile(AppData.officialName(hero), '');
  }

  void addToHand(PoolCard pc, bool onlyHand) {
    final hand = List<dynamic>.from(widget.proj[widget.isMine ? 'myHandCards' : 'teammateHandCards'] ?? []);
    if (hand.length >= 10) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('手牌已满 10 张'), duration: Duration(milliseconds: 700)));
      return;
    }
    final official = AppData.officialName(pc.name);
    final selfFusion = AppData.I.splitFusion(pc.name) != null;
    final def = globalHeroDefaults[official] as Map<String, dynamic>?;
    final cardName = selfFusion
        ? pc.name   // 融合卡：卡名就是融合名
        : ((def != null && def['fusion']?.toString().isNotEmpty == true) ? def['fusion'].toString() : official);

    // 对齐网页 handHasIdentity：同一身份（含基础卡与其融合形态）只能带 1 张
    final wantIdentity = AppData.I.cardIdentity(cardName);
    for (final c in hand) {
      if (AppData.I.cardIdentity((c as Map)['name']?.toString() ?? '') == wantIdentity) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('手牌已有「${pc.name}」（含融合形态），同一张卡只能带 1 张'),
            duration: const Duration(milliseconds: 900)));
        return;
      }
    }

    final card = {
      'id': pc.id.isEmpty ? '${1000 + DateTime.now().millisecondsSinceEpoch % 100000}' : pc.id,
      'name': cardName,
      'placed': null,
      'isEngineering': pc.eng,
      'profession': pc.eng ? 'engineering' : pc.prof,
      'type': pc.type,
    };
    hand.add(card);
    // 套用该英雄的默认配置（等级/皮肤/魔化/副卡）
    if (def != null) {
      Map<String, dynamic> ensure(String field) {
        var m = widget.proj[field] as Map<String, dynamic>?;
        m ??= {};
        widget.proj[field] = m;
        return m;
      }
      final key = 'my_${card['id']}';
      final lvParent = ensure('cardLevels');
      final lvStore = (lvParent['my'] as Map<String, dynamic>?) ?? <String, dynamic>{};
      lvStore[key] = def['lv'] ?? '1';
      lvParent['my'] = lvStore;
      ensure('cardSkins')[key] = def['skin'] ?? '';
      ensure('cardMoHua')[key] = def['mohua'] == true;
      final fParts = AppData.I.splitFusion(card['name'].toString());
      if (fParts != null) {
        final sub = def['sub'] as Map<String, dynamic>?;
        if (sub != null) {
          ensure('fusionLevels')[fParts[1]] = sub['lv'] ?? '1';
          ensure('fusionSkins')[fParts[1]] = sub['skin'] ?? '';
          ensure('fusionMoHua')[fParts[1]] = sub['mohua'] == true;
        }
      }
    }
    widget.proj[widget.isMine ? 'myHandCards' : 'teammateHandCards'] = hand;
    if (!onlyHand) {
      // 自动上阵（网页 findEmptySlot）
      final prefix = widget.isMine ? 'u' : 't';
      if (pc.eng) {
        final eng = hand.indexWhere((e) => ((e as Map)['placed'] ?? '') == '${prefix}0');
        if (eng == -1) card['placed'] = '${prefix}0';
      } else {
        for (var i = 6; i >= 1; i--) {
          final occ = hand.indexWhere((e) => ((e as Map)['placed'] ?? '') == '$prefix$i');
          if (occ == -1) { card['placed'] = '$prefix$i'; break; }
        }
      }
    }
    widget.onAdded();
  }
}

/// ⚙️ 设置面板（网页旧版式）：等级滑条 + 皮肤 + 魔化 + 融合变体 + 副卡设置
class SettingsSheet extends StatefulWidget {
  final bool isMine;
  final int handIdx;
  final Map<String, dynamic> cardObj;
  final Map<String, dynamic> proj;
  final bool onField;
  final VoidCallback onChanged;
  final VoidCallback onPlace;
  final VoidCallback onTakeOff;
  final VoidCallback onRemove;

  const SettingsSheet({
    required this.isMine,
    required this.handIdx,
    required this.cardObj,
    required this.proj,
    required this.onField,
    required this.onChanged,
    required this.onPlace,
    required this.onTakeOff,
    required this.onRemove,
  });

  @override
  State<SettingsSheet> createState() => SettingsSheetState();
}

class SettingsSheetState extends State<SettingsSheet> {
  late String key;
  late String name;
  late String type;
  late List<String>? fusion;
  late String baseHero;
  String subHero = '';

  @override
  void initState() {
    super.initState();
    key = '${widget.isMine ? "my" : "teammate"}_${widget.cardObj['id'] ?? ''}';
    name = widget.cardObj['name']?.toString() ?? '';
    final official = AppData.officialName(name);
    final f = AppData.I.splitFusion(name);
    fusion = f;
    baseHero = f != null ? f[0] : official;
    subHero = f != null ? f[1] : '';
    final pc = AppData.I.poolByName[baseHero];
    type = pc?.type ?? _guess(widget.cardObj['type']?.toString() ?? 'gold');
  }

  String _guess(String t) => t;

  /// 融合切换后重算（留在面板内）
  void _reinit() {
    name = widget.cardObj['name']?.toString() ?? '';
    final official = AppData.officialName(name);
    final f = AppData.I.splitFusion(name);
    setState(() {
      fusion = f;
      baseHero = f != null ? f[0] : official;
      subHero = f != null ? f[1] : '';
    });
    widget.onChanged();
  }

  Map<String, dynamic> _levelStore() {
    final levels = (widget.proj['cardLevels'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    var store = (levels[widget.isMine ? 'my' : 'teammate'] as Map<String, dynamic>?);
    store ??= {};
    levels[widget.isMine ? 'my' : 'teammate'] = store;
    widget.proj['cardLevels'] = levels;
    return store;
  }

  Map<String, dynamic> _ensureMap(String field) {
    var m = widget.proj[field] as Map<String, dynamic>?;
    m ??= {};
    widget.proj[field] = m;
    return m;
  }

  @override
  Widget build(BuildContext context) {
    final levels = AppData.availableLevels(type);
    final store = _levelStore();
    final curLv = int.tryParse(store[key]?.toString() ?? '1') ?? 1;
    var curIdx = levels.indexOf(curLv);
    if (curIdx < 0) curIdx = 0;
    final placed = (widget.cardObj['placed']?.toString() ?? '');
    final onField = placed.isNotEmpty && placed != 'null';
    final mhMap = _ensureMap('cardMoHua');
            final mohua = mhMap[key] == true;
    final skinStore = _ensureMap('cardSkins');
    final curSkin = skinStore[key]?.toString() ?? '';

    return SafeArea(
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('⚙️ $name${onField ? "（场上 $placed）" : "（手牌）"}',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
            const SizedBox(height: 8),
            // 等级
            Text('📊 等级：Lv $curLv', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: const Color(0xFF4ECDC4),
                thumbColor: const Color(0xFF4ECDC4),
                inactiveTrackColor: Colors.white24,
              ),
              child: Slider(
                min: 0, max: (levels.length - 1).toDouble(), divisions: levels.length - 1, value: curIdx.toDouble(),
                onChanged: (_) {},
                onChangeEnd: (v) {
                  store[key] = '${levels[v.round()]}';
                  setState(() {});
                  widget.onChanged();
                },
              ),
            ),
            // 皮肤
            const Text('🎨 皮肤', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFFF9800))),
            const SizedBox(height: 4),
            SizedBox(
              height: 62,
              child: FutureBuilder<List<String>>(
                future: Future(() => SkinPack.I.skinsOfHero(baseHero)),
                builder: (_, snap) {
                  final skins = snap.data ?? const ['默认'];
                  return ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: skins.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 6),
                    itemBuilder: (_, i) {
                      final sk = skins[i];
                      final sel = ('默认' == sk && curSkin.isEmpty) || sk == curSkin;
                      return GestureDetector(
                        onTap: () {
                          skinStore[key] = '默认' == sk ? '' : sk;
                          setState(() {});
                          widget.onChanged();
                        },
                        child: Container(
                          width: 54, height: 54,
                          padding: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            color: sel ? const Color(0xFFFFD24A) : Colors.white.withAlpha(50),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: FutureBuilder<File?>(
                            future: _skinFile(baseHero, sk),
                            builder: (_, s2) {
                              final f = s2.data;
                              return f != null
                                  ? ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.file(f, fit: BoxFit.cover))
                                  : const SizedBox();
                            },
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
            const SizedBox(height: 6),
            // 魔化（官方数据里有魔化的英雄才显示——魔化是写死的，不能乱加）
            if (SkinPack.I.hasMohuaData(baseHero))
              GestureDetector(
                onTap: () {
                  mhMap[key] = !mohua;
                  setState(() {});
                  widget.onChanged();
                },
                child: _pill(mohua ? '👹 魔化已开启' : '👹 魔化未开启', mohua ? const Color(0xFF7C4BC0) : Colors.white.withAlpha(50)),
              )
            else
              _pill('👹 该英雄无魔化', Colors.white.withAlpha(24)),
            const SizedBox(height: 8),
            // 融合变体
            _fusionVariants(),
            // 副卡设置
            if (subHero.isNotEmpty) _subSection(),
            const SizedBox(height: 8),
            // 操作
            if (!onField)
              _pillBtn('⬆ 上阵（自动空槽）', const Color(0x662BB3A3), widget.onPlace)
            else
              _pillBtn('⬇ 取下回手牌', Colors.white.withAlpha(70), widget.onTakeOff),
            const SizedBox(height: 6),
            _pillBtn('🗑 移出手牌', const Color(0x88B03A3A), widget.onRemove),
            const SizedBox(height: 4),
          ]),
        ),
      ),
    );
  }

  /// 🔗 融合变体：副卡图片卡片（横滑），点击后面板内切换（不回主页，继续设置副卡）
  Widget _fusionVariants() {
    final variants = AppData.I.fusionVariantsOf(baseHero);
    if (variants.isEmpty) return const SizedBox();
    final others = variants.where((p) => p[0] + p[1] != name).toList();
    if (others.isEmpty && fusion == null) return const SizedBox();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(fusion != null ? '🔗 融合变体（当前副卡：$subHero）' : '🔗 融合变体（选副卡）',
          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF9BE9E0))),
      const SizedBox(height: 4),
      SizedBox(
        height: 78,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            if (fusion != null)
              GestureDetector(
                onTap: () {
                  widget.cardObj['name'] = baseHero;
                  _reinit();
                },
                child: _variantCard(null, '不融合', false),
              ),
            for (final p in others)
              GestureDetector(
                onTap: () {
                  widget.cardObj['name'] = p[0] + p[1];
                  _reinit();   // 面板内切换，副卡设置区随即出现在下方
                },
                child: _variantCard(p[1], p[0] + p[1], false),
              ),
          ],
        ),
      ),
      const SizedBox(height: 4),
    ]);
  }

  /// 变体卡片：副卡皮肤图 + 名字（选中金框）
  Widget _variantCard(String? subHeroName, String label, bool selected) {
    final showSub = subHeroName != null && subHeroName.isNotEmpty;
    return Container(
      width: 56,
      margin: const EdgeInsets.only(right: 6),
      child: Column(children: [
        Container(
          width: 56, height: 56,
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFFFD24A) : Colors.white.withAlpha(45),
            borderRadius: BorderRadius.circular(8),
          ),
          child: showSub
              ? FutureBuilder<File?>(
                  future: Future(() async {
                    await SkinPack.I.ensurePack();
                    return SkinPack.I.skinFile(subHeroName!, '') ?? SkinPack.I.skinFileByAny(subHeroName);
                  }),
                  builder: (_, s2) => s2.data != null
                      ? ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.file(s2.data!, fit: BoxFit.cover))
                      : const SizedBox(),
                )
              : const Center(child: Text('✕', style: TextStyle(fontSize: 18, color: Colors.white54))),
        ),
        const SizedBox(height: 2),
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 8, color: Color(0xFFCFD6E6))),
      ]),
    );
  }

  Widget _subSection() {
    final subPc = AppData.I.poolByName[subHero];
    final subType = subPc?.type ?? 'gold';
    final levels = AppData.availableLevels(subType);
    final fLv = _ensureMap('fusionLevels');
    final curLv = int.tryParse(fLv[subHero]?.toString() ?? '1') ?? 1;
    var curIdx = levels.indexOf(curLv);
    if (curIdx < 0) curIdx = 0;
    final fMh = _ensureMap('fusionMoHua');
    final subMh = fMh[subHero] == true;
    final fSkins = _ensureMap('fusionSkins');
    var curSubSkin = fSkins[subHero]?.toString() ?? '';
    if (curSubSkin.isEmpty) {
      fSkins.forEach((k, v) {
        if (AppData.officialName(k) == subHero && v.toString().isNotEmpty && curSubSkin.isEmpty) curSubSkin = v.toString();
      });
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('🔗 融合副卡：$subHero', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFFFF9800))),
      const SizedBox(height: 4),
      SizedBox(
        height: 62,
        child: FutureBuilder<List<String>>(
          future: Future(() => SkinPack.I.skinsOfHero(subHero)),
          builder: (_, snap) {
            final skins = snap.data ?? const ['默认'];
            return ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: skins.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, i) {
                final sk = skins[i];
                final sel = ('默认' == sk && curSubSkin.isEmpty) || sk == curSubSkin;
                return GestureDetector(
                  onTap: () {
                    // 统一按官方副卡名存（渲染兼容短名）
                    fSkins[subHero] = '默认' == sk ? '' : sk;
                    setState(() {});
                    widget.onChanged();
                  },
                  child: Container(
                    width: 54, height: 54,
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: sel ? const Color(0xFFFFD24A) : Colors.white.withAlpha(50),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: FutureBuilder<File?>(
                      future: _skinFile(subHero, sk),
                      builder: (_, s2) {
                        final f = s2.data;
                        return f != null
                            ? ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.file(f, fit: BoxFit.cover))
                            : const SizedBox();
                      },
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
      Text('📊 副卡等级：Lv $curLv', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
      SliderTheme(
        data: SliderTheme.of(context).copyWith(
          activeTrackColor: const Color(0xFF4ECDC4),
          thumbColor: const Color(0xFF4ECDC4),
          inactiveTrackColor: Colors.white24,
        ),
        child: Slider(
          min: 0, max: (levels.length - 1).toDouble(), divisions: levels.length - 1, value: curIdx.toDouble(),
          onChanged: (_) {},
          onChangeEnd: (v) {
            fLv[subHero] = '${levels[v.round()]}';
            setState(() {});
            widget.onChanged();
          },
        ),
      ),
      if (SkinPack.I.hasMohuaData(subHero))
        GestureDetector(
          onTap: () {
            fMh[subHero] = !subMh;
            setState(() {});
            widget.onChanged();
          },
          child: _pill(subMh ? '👹 副卡魔化已开启' : '👹 副卡魔化未开启', subMh ? const Color(0xFF7C4BC0) : Colors.white.withAlpha(50)),
        ),
      const SizedBox(height: 6),
    ]);
  }

  Future<File?> _skinFile(String hero, String skin) async {
    await SkinPack.I.ensurePack();
    if (skin.isEmpty || skin == '默认') return SkinPack.I.skinFile(AppData.officialName(hero), '');
    return SkinPack.I.skinFile(AppData.officialName(hero), skin) ?? SkinPack.I.skinFileByAny(skin);
  }

  Widget _pill(String text, Color color) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
        child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
      );

  Widget _pillBtn(String text, Color color, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
          child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFEAF4FF))),
        ),
      );
}
