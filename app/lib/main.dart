import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';
import 'data_store.dart';
import 'card_widget.dart';
import 'sheets.dart';
import 'library_page.dart';
import 'net_prime.dart';
import 'net_check_sheet.dart';
import 'layout_config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TfjlApp());
  // iOS 关键：首帧渲染完、App 进入 active 后再主动发一次公网请求，
  // 把「无线局域网与蜂窝数据」授权拉起来（MQTT 项目已验证：太早发会被系统吞掉）。
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    await Future.delayed(const Duration(milliseconds: 500));
    await NetPrime.prime();
  });
}

class TfjlApp extends StatelessWidget {
  const TfjlApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '塔防助手',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0C0C17),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2BB3A3), brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

/// 拖动卡牌载荷：手牌下标 + 来源卡槽（从手牌直接拖来时为 null）
class CardDragData {
  final bool isMine;
  final int handIndex;
  final String? fromSlot;
  const CardDragData({required this.isMine, required this.handIndex, this.fromSlot});
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  Map<String, dynamic>? proj;
  String gistId = '';
  int sourceMode = 0;               // 0本地 1共享
  String lastLocalName = '';
  Map<String, dynamic>? shareIndex; // {key:{id,n,cat,ts}}
  String shareCat = '';
  bool loading = true;
  double packPct = -1;              // 皮肤包下载进度
  String loadStage = '';
  String? dragOverSlot;
  int? dragOverHandIdx;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await AppData.I.load();
    await LayoutConfig.I.load();
    SkinPack.I.onProgress = (p, s) {
      if (!SkinPack.I.ready && mounted) setState(() { packPct = p; loadStage = s; });
    };
    final prefs = await SharedPreferences.getInstance();
    lastLocalName = prefs.getString('lastLocal') ?? '';
    final lib = await ProjectLibrary.load();
    Map<String, dynamic>? local;
    for (final it in lib) {
      if ((it as Map)['name'] == lastLocalName) { local = Map<String, dynamic>.from(it['project']); break; }
    }
    local ??= lib.isNotEmpty ? Map<String, dynamic>.from((lib.first as Map)['project']) : null;
    proj = local ?? AppData.emptyProject(name: '示例阵容', category: '深海');
    setState(() => loading = false);
    await SkinPack.I.ensurePack();
    if (mounted) setState(() => packPct = -1);
  }

  List<dynamic> handCards(bool isMine) =>
      List<dynamic>.from(proj?[isMine ? 'myHandCards' : 'teammateHandCards'] ?? []);

  void refresh() => setState(() {});

  /// 本地项目改动持久化（共享模式不写本地库）
  Future<void> persistProject() async {
    if (gistId.isNotEmpty || proj == null) return;
    final lib = await ProjectLibrary.load();
    for (final it in lib) {
      if ((it as Map)['name'] == proj!['name']) {
        it['project'] = proj;
        await ProjectLibrary.save(lib);
        return;
      }
    }
  }

  // ------------------------------------------------------- 上阵/取下
  int handIndexBySlot(bool isMine, String slot) {
    final hand = handCards(isMine);
    for (var i = 0; i < hand.length; i++) {
      final c = hand[i] as Map<String, dynamic>;
      final pl = c['placed']?.toString() ?? '';
      if (pl.isNotEmpty && pl != 'null' && pl == slot) return i;
    }
    return -1;
  }

  String? findEmptySlotAuto(bool isMine, Map<String, dynamic> card) {
    final prefix = isMine ? 'u' : 't';
    if (card['profession'] == 'pokeball') return null;
    final eng = card['isEngineering'] == true;
    if (eng) {
      final slot = '${prefix}0';
      return handIndexBySlot(isMine, slot) == -1 ? slot : null;
    }
    for (var i = 6; i >= 1; i--) {
      final slot = '$prefix$i';
      if (handIndexBySlot(isMine, slot) == -1) return slot;
    }
    return null;
  }

  void autoPlace(bool isMine, int handIdx) {
    final hand = handCards(isMine);
    if (handIdx >= hand.length) return;
    final card = hand[handIdx] as Map<String, dynamic>;
    final slot = findEmptySlotAuto(isMine, card);
    if (slot == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(card['profession'] == 'pokeball' ? '精灵球不能上阵' : (card['isEngineering'] == true ? '工程位已被占用' : '没有空卡槽了')),
        duration: const Duration(milliseconds: 800)));
      return;
    }
    card['placed'] = slot;
    refresh();
  }

  void takeOff(bool isMine, int handIdx) {
    final hand = handCards(isMine);
    if (handIdx < hand.length) {
      (hand[handIdx] as Map<String, dynamic>)['placed'] = null;
      refresh();
    }
  }

  // ------------------------------------------------------- 自由拖动布局
  /// 卡槽合法性：工程卡只能进 0 号位，精灵球不能上阵，普通卡只能进 1-6 号位
  bool _canDropToSlot(Map<String, dynamic> card, String slot) {
    if (card['profession'] == 'pokeball') return false;
    final eng = card['isEngineering'] == true;
    return eng == slot.endsWith('0');
  }

  void _clearDragHighlights() {
    if (!mounted) return;
    setState(() { dragOverSlot = null; dragOverHandIdx = null; });
  }

  /// 把卡拖到指定卡槽：占位则互换（从手牌拖来时原占位卡退回手牌）
  void applySlotDrop(CardDragData d, bool targetMine, String targetSlot) {
    if (d.isMine != targetMine) return;
    final hand = handCards(targetMine);
    if (d.handIndex >= hand.length) return;
    final card = hand[d.handIndex] as Map<String, dynamic>;
    final prefix = targetMine ? 'u' : 't';
    if (!targetSlot.startsWith(prefix) || !_canDropToSlot(card, targetSlot)) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(card['profession'] == 'pokeball'
            ? '精灵球不能上阵'
            : (card['isEngineering'] == true ? '工程卡只能拖到 0 号位' : '普通卡不能拖到 0 号位')),
        duration: const Duration(milliseconds: 900)));
      _clearDragHighlights();
      return;
    }
    final old = card['placed']?.toString() ?? '';
    final oldSlot = (old.isEmpty || old == 'null') ? null : old;
    final occIdx = handIndexBySlot(targetMine, targetSlot);
    if (occIdx >= 0 && occIdx != d.handIndex) {
      final occ = hand[occIdx] as Map<String, dynamic>;
      occ['placed'] = oldSlot;
    }
    card['placed'] = targetSlot;
    _clearDragHighlights();
    persistProject();
  }

  /// 拖回手牌格：取下卡牌，并按落点重新排列手牌顺序
  void applyHandDrop(CardDragData d, bool targetMine, int targetIdx) {
    if (d.isMine != targetMine) return;
    // 必须直接操作项目里的真实列表，handCards() 返回的是临时副本
    final key = targetMine ? 'myHandCards' : 'teammateHandCards';
    final hand = proj?[key] as List?;
    if (hand == null || d.handIndex >= hand.length) return;
    var dst = targetIdx.clamp(0, hand.length);
    final item = hand.removeAt(d.handIndex);
    if (dst > hand.length) dst = hand.length;
    hand.insert(dst, item);
    (item as Map<String, dynamic>)['placed'] = null;
    _clearDragHighlights();
    persistProject();
  }

  // ------------------------------------------------------- 顶栏与项目栏
  Widget buildTopBar() {
    final fromShare = sourceMode == 1;
    return Container(
      color: const Color(0xFF12122A),
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
      child: Column(children: [
        Row(children: [
          const Text('🛡 塔防助手', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white)),
          const Spacer(),
          GestureDetector(
            onTap: _showToolsMenu,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: const Color(0xFFFFB300), borderRadius: BorderRadius.circular(7)),
              child: const Text('☰ 工具', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        SizedBox(
          height: 30,
          child: Row(children: [
            Expanded(
              flex: 3,
              child: DropdownButtonFormField<int>(
                value: sourceMode,
                dropdownColor: const Color(0xFF1E1E36),
                decoration: _ddDecor(),
                style: const TextStyle(fontSize: 11, color: Colors.white),
                items: const [
                  DropdownMenuItem(value: 0, child: Text('📱 本地', style: TextStyle(fontSize: 11))),
                  DropdownMenuItem(value: 1, child: Text('☁ 共享', style: TextStyle(fontSize: 11))),
                ],
                onChanged: (v) {
                  if (v == sourceMode) return;
                  setState(() {
                    sourceMode = v!;
                    if (sourceMode == 0) {
                      gistId = '';
                      _loadLocalCurrent();
                    }
                    if (sourceMode == 1 && shareIndex == null) _loadShareIndex();
                  });
                },
              ),
            ),
            const SizedBox(width: 4),
            if (!fromShare) ..._localSelectors() else ..._shareSelectors(),
          ]),
        ),
      ]),
    );
  }

  InputDecoration _ddDecor() => InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        filled: true,
        fillColor: const Color(0xFF1E1E36),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
      );

  List<Widget> _localSelectors() {
    return [
      FutureBuilder<List<dynamic>>(
        future: ProjectLibrary.load(),
        builder: (c, snap) {
          final lib = snap.data ?? [];
          final cats = <String>{};
          for (final it in lib) {
            final cc = (it as Map)['category']?.toString() ?? '';
            if (cc.isNotEmpty) cats.add(cc);
          }
          final curCat = proj?['category']?.toString() ?? '';
          if (curCat.isNotEmpty) cats.add(curCat);
          final catList = cats.toList()..add('➕ 新建分类');
          final value = catList.contains(curCat) ? curCat : catList.first;
          return Expanded(
            flex: 4,
            child: DropdownButtonFormField<String>(
              value: value,
              dropdownColor: const Color(0xFF1E1E36),
              decoration: _ddDecor(),
              style: const TextStyle(fontSize: 11, color: Colors.white),
              isDense: true,
              items: catList.map((e) => DropdownMenuItem(value: e, child: Text(e, style: const TextStyle(fontSize: 11), overflow: TextOverflow.ellipsis))).toList(),
              onChanged: (v) {
                if (v == null) return;
                if (v.startsWith('➕')) { _promptNewCategory(); return; }
                setState(() => proj?['category'] = v);
              },
            ),
          );
        },
      ),
      const SizedBox(width: 4),
      FutureBuilder<List<dynamic>>(
        future: ProjectLibrary.load(),
        builder: (c, snap) {
          final lib = snap.data ?? [];
          final curCat = proj?['category']?.toString() ?? '';
          final names = <String>[];
          final items = <Map>[];
          for (final it in lib) {
            if ((it as Map)['category']?.toString() == curCat) {
              names.add(it['name']?.toString() ?? '未命名');
              items.add(it);
            }
          }
          names.add('➕ 新建项目');
          final curName = proj?['name']?.toString() ?? '';
          final value = names.contains(curName) ? curName : (names.length > 1 ? names.first : names.last);
          return Expanded(
            flex: 8,
            child: DropdownButtonFormField<String>(
              value: value,
              dropdownColor: const Color(0xFF1E1E36),
              decoration: _ddDecor(),
              style: const TextStyle(fontSize: 11, color: Colors.white),
              isDense: true,
              items: names.map((e) => DropdownMenuItem(value: e, child: Text(e, style: const TextStyle(fontSize: 11), overflow: TextOverflow.ellipsis))).toList(),
              onChanged: (v) async {
                if (v == null) return;
                if (v.startsWith('➕')) { _promptNewProject(curCat); return; }
                for (final it in items) {
                  if (it['name'] == v) {
                    setState(() {
                      proj = Map<String, dynamic>.from(it['project'] ?? {});
                      gistId = '';
                      lastLocalName = v;
                    });
                    SharedPreferences.getInstance().then((p) => p.setString('lastLocal', v));
                    break;
                  }
                }
              },
            ),
          );
        },
      ),
    ];
  }

  List<Widget> _shareSelectors() {
    if (shareIndex == null) {
      return const [
        Expanded(flex: 1, child: _DisabledBox('分类…')),
        SizedBox(width: 4),
        Expanded(flex: 16, child: _DisabledBox('加载共享列表…')),
      ];
    }
    final byCat = <String, List<Map<String, dynamic>>>{};
    shareIndex!.forEach((k, v) {
      if (v is! Map<String, dynamic>) return;
      if ((v['id'] ?? '').toString().isEmpty) return;
      final cat = (v['cat'] ?? '未分类').toString();
      byCat.putIfAbsent(cat, () => []).add(v);
    });
    final cats = byCat.keys.toList();
    if (shareCat.isEmpty || !cats.contains(shareCat)) shareCat = cats.isNotEmpty ? cats.first : '';
    final items = byCat[shareCat] ?? [];
    final names = items.map((e) => (e['n'] ?? '未命名').toString()).toList();
    final curName = proj?['name']?.toString() ?? '';
    final value = names.contains(curName) ? curName : (names.isNotEmpty ? names.first : null);
    return [
      Expanded(
        flex: 4,
        child: DropdownButtonFormField<String>(
          value: shareCat,
          dropdownColor: const Color(0xFF1E1E36),
          decoration: _ddDecor(),
          style: const TextStyle(fontSize: 11, color: Colors.white),
          isDense: true,
          items: cats.map((e) => DropdownMenuItem(value: e, child: Text(e, style: const TextStyle(fontSize: 11), overflow: TextOverflow.ellipsis))).toList(),
          onChanged: (v) { if (v != null) setState(() => shareCat = v); },
        ),
      ),
      const SizedBox(width: 4),
      Expanded(
        flex: 8,
        child: DropdownButtonFormField<String>(
          value: value,
          dropdownColor: const Color(0xFF1E1E36),
          decoration: _ddDecor(),
          style: const TextStyle(fontSize: 11, color: Colors.white),
          isDense: true,
          items: names.map((e) => DropdownMenuItem(value: e, child: Text(e, style: const TextStyle(fontSize: 11), overflow: TextOverflow.ellipsis))).toList(),
          onChanged: (v) async {
            if (v == null) return;
            for (final e in items) {
              if ((e['n'] ?? '').toString() == v) {
                final gid = (e['id'] ?? '').toString();
                if (gid.isNotEmpty && gid != gistId) {
                  setState(() { gistId = gid; loading = true; });
                  // 缓存秒开
                  final cproj = await GistClient.readProjectCached(gid);
                  if (mounted && cproj != null) setState(() { proj = cproj; loading = false; });
                  final p = await GistClient.readProject(gid);
                  if (p == null && cproj != null) { /* 用缓存 */ continue; }
                  if (mounted) {
                    if (p != null) {
                      setState(() { proj = p; loading = false; });
                    } else {
                      setState(() => loading = false);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('共享阵容加载失败（网络/token），请重试'),
                        duration: Duration(seconds: 2)));
                    }
                  }
                }
                break;
              }
            }
          },
        ),
      ),
    ];
  }

  Future<void> _loadShareIndex() async {
    // 先读本地缓存（秒开），后台拉新覆盖
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString('share_index_cache');
    if (cached != null && cached.isNotEmpty) {
      try { setState(() => shareIndex = jsonDecode(cached) as Map<String, dynamic>); } catch (_) {}
    }
    final idx = await GistClient.readShareIndex();
    if (mounted && idx != null) {
      setState(() => shareIndex = idx);
      prefs.setString('share_index_cache', jsonEncode(idx));
    }
  }

  Future<void> _loadLocalCurrent() async {
    final lib = await ProjectLibrary.load();
    if (lib.isEmpty) { refresh(); return; }
    Map? pick;
    for (final it in lib) {
      if ((it as Map)['name'] == lastLocalName) { pick = it; break; }
    }
    pick ??= lib.first;
    setState(() => proj = Map<String, dynamic>.from(pick!['project']));
  }

  void _promptNewCategory() {
    final ctl = TextEditingController();
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('新建分类'),
      content: TextField(controller: ctl, decoration: const InputDecoration(hintText: '分类名，如：深海')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
        FilledButton(onPressed: () {
          final v = ctl.text.trim();
          Navigator.pop(context);
          if (v.isNotEmpty) _promptNewProject(v);
        }, child: const Text('下一步')),
      ],
    ));
  }

  void _promptNewProject(String category) {
    final ctl = TextEditingController();
    showDialog(context: context, builder: (_) => AlertDialog(
      title: Text('新建项目（$category）'),
      content: TextField(controller: ctl, decoration: const InputDecoration(hintText: '项目名，如：我的主力阵容')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
        FilledButton(onPressed: () async {
          final nm = ctl.text.trim();
          Navigator.pop(context);
          if (nm.isEmpty) return;
          await ProjectLibrary.addProject(category, nm, AppData.emptyProject(name: nm, category: category));
          setState(() {
            proj = AppData.emptyProject(name: nm, category: category);
            gistId = '';
            lastLocalName = nm;
          });
          SharedPreferences.getInstance().then((p) => p.setString('lastLocal', nm));
        }, child: const Text('创建')),
      ],
    ));
  }

  // ------------------------------------------------------- 工具菜单
  void _showToolsMenu() {
    showModalBottomSheet(context: context, backgroundColor: const Color(0xFF1A1A2E), builder: (_) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Padding(padding: EdgeInsets.all(12), child: Align(alignment: Alignment.centerLeft, child: Text('🧰 工具 v${AppData.appVersion}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))))),
        ListTile(leading: const Text('📚', style: TextStyle(fontSize: 20)), title: const Text('阵容图库', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          subtitle: const Text('精选 · 活动 7 天 A/B · 大航海 223 套', style: TextStyle(fontSize: 10, color: Colors.white54)),
          onTap: () { Navigator.pop(context); Navigator.push(context, MaterialPageRoute(builder: (_) => const LibraryPage())); }),
        ListTile(leading: const Text('📖', style: TextStyle(fontSize: 20)), title: const Text('使用说明', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          subtitle: const Text('上下卡 / 设置 / 卡池的用法', style: TextStyle(fontSize: 10, color: Colors.white54)),
          onTap: () { Navigator.pop(context); _showHelp(); }),
        ListTile(leading: const Text('🌐', style: TextStyle(fontSize: 20)), title: const Text('网络自检', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          subtitle: const Text('共享打不开？测一下是哪个环节不通', style: TextStyle(fontSize: 10, color: Colors.white54)),
          onTap: () { Navigator.pop(context); _showNetCheck(); }),
      ]),
    ));
  }

  void _showNetCheck() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF16162C),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => const NetCheckSheet(),
    );
  }

  void _showHelp() {
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('📖 使用说明'),
      content: const SingleChildScrollView(child: Text(
        '【上下卡】\n'
        '· 点手牌里未上阵的卡 → 自动按顺序上阵\n'
        '· 点卡槽里的卡 → 取下回手牌\n'
        '· 已上阵的卡在手牌里变灰\n\n'
        '【设置（等级/皮肤/魔化/融合）】\n'
        '· 长按手牌或卡槽里的卡 → 设置面板\n'
        '· 点已上阵（变灰）的卡也能打开\n\n'
        '【卡池】\n'
        '· 点手牌标题旁「🎴 卡池」→ 点卡直接加手牌并上阵（长按只加手牌）\n\n'
        '【自由拖动布局】\n'
        '· 按住卡牌拖动：手牌→任意卡槽（指定位置上阵）\n'
        '· 卡槽→卡槽：移动/交换位置\n'
        '· 卡槽/手牌→手牌格：取下并按落点重排\n'
        '· 工程卡只能进 0 号位，精灵球不能上阵\n\n'
        '【项目】\n'
        '· 顶栏下拉：本地/共享 → 分类 → 项目\n'
        '· 本地可新建分类和项目',
        style: TextStyle(fontSize: 12, height: 1.5))),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('知道了'))],
    ));
  }

  // ------------------------------------------------------- 页面
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: loading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF2BB3A3)))
            : Column(children: [
                buildTopBar(),
                if (packPct >= 0) _packProgress(),
                Expanded(
                  child: ReorderableListView.builder(
                    padding: const EdgeInsets.fromLTRB(4, 4, 4, 10),
                    itemCount: LayoutConfig.I.order.length + 1,
                    onReorder: (oldIdx, newIdx) => _reorderModule(oldIdx, newIdx),
                    buildDefaultDragHandles: false,
                    proxyDecorator: (child, index, animation) => Material(
                      elevation: 6,
                      color: const Color(0xFF24243E),
                      borderRadius: BorderRadius.circular(10),
                      child: child,
                    ),
                    itemBuilder: (context, index) {
                      // 第 0 项是项目名称头（不可拖动）
                      if (index == 0) {
                        return Padding(
                          key: const ValueKey('title'),
                          padding: const EdgeInsets.only(left: 3, bottom: 4),
                          child: Row(children: [
                            Text('⚔ ${proj?['name'] ?? '出战选择'}',
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
                            const Spacer(),
                            const Text('⠿ 拖动模块 · ⤢ 改大小', style: TextStyle(fontSize: 9, color: Colors.white38)),
                          ]),
                        );
                      }
                      final moduleId = LayoutConfig.I.order[index - 1];
                      return _buildModule(moduleId, index);
                    },
                  ),
                ),
              ]),
      ),
    );
  }

  /// 模块拖动排序（第 0 项是标题，不可拖，所以索引要 -1）
  void _reorderModule(int oldIdx, int newIdx) {
    final o = oldIdx - 1;
    var n = newIdx - 1;
    if (o < 0 || o >= LayoutConfig.I.order.length) return;
    if (n < 0) n = 0;
    if (n >= LayoutConfig.I.order.length) n = LayoutConfig.I.order.length - 1;
    if (o == n) return;
    setState(() {
      final item = LayoutConfig.I.order.removeAt(o);
      LayoutConfig.I.order.insert(n, item);
    });
    LayoutConfig.I.save();
  }

  /// 单个模块外壳：⠿ 拖动把手 + ⤢ 大小切换 + 模块内容
  Widget _buildModule(String moduleId, int listIndex) {
    final isMine = moduleId == 'myField' || moduleId == 'myHand';
    final isField = moduleId.endsWith('Field');
    final sizeIdx = LayoutConfig.I.sizes[moduleId] ?? 1;
    final accent = isMine ? const Color(0xFF67D2F5) : const Color(0xFFC79BF0);
    return Container(
      key: ValueKey(moduleId),
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF14142A),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withAlpha(18)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // 模块头：拖动把手 + 名字 + 大小切换
        Row(children: [
          ReorderableDragStartListener(
            index: listIndex,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              child: Text('⠿', style: TextStyle(fontSize: 15, color: Colors.white.withAlpha(120))),
            ),
          ),
          Expanded(child: Text(LayoutConfig.moduleNames[moduleId] ?? moduleId,
              style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: accent))),
          GestureDetector(
            onTap: () => setState(() => LayoutConfig.I.nextSize(moduleId)),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(color: Colors.white.withAlpha(25), borderRadius: BorderRadius.circular(5)),
              child: Text(['小', '中', '大'][sizeIdx], style: const TextStyle(fontSize: 9, color: Colors.white70)),
            ),
          ),
          const SizedBox(width: 6),
        ]),
        // 模块内容
        if (isField) buildCardGroup(isMine, moduleId) else buildHandGroup(isMine, moduleId),
      ]),
    );
  }

  Widget _packProgress() {
    return Container(
      color: const Color(0xFF12122A),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(loadStage, style: const TextStyle(fontSize: 10, color: Color(0xFFCFD6E6))),
        const SizedBox(height: 3),
        LinearProgressIndicator(value: packPct / 100, minHeight: 5, backgroundColor: Colors.white12, color: const Color(0xFF2BB3A3)),
      ]),
    );
  }

  // ------------------------------------------------------- 卡组区
  Widget buildCardGroup(bool isMine, String moduleId) {
    final hand = handCards(isMine);
    var filled = 0;
    for (final c in hand) {
      final pl = (c as Map<String, dynamic>)['placed']?.toString() ?? '';
      if (pl.isNotEmpty && pl != 'null') filled++;
    }
    final scale = LayoutConfig.I.scaleOf(moduleId);
    // 模块现在独占整行，卡片按档位放大
    final colW = (MediaQuery.of(context).size.width - 30) / 2;
    final gap = 4.0;
    final cardW = (colW - gap) / 2 * scale;
    final cardH = cardW * 0.92;

    Widget slot(String id) {
      final hi = handIndexBySlot(isMine, id);
      final cd = hi >= 0 ? parseCard(hand[hi], isMine, proj!, pack: SkinPack.I) : CardData();
      final card = GestureDetector(
        onTap: () { if (hi >= 0) takeOff(isMine, hi); },
        onLongPress: () { if (hi >= 0) showCardSettings(cd, isMine, hi); },
        child: CardSlot(data: cd, size: cardW),
      );
      final draggable = hi >= 0
          ? Draggable<CardDragData>(
              data: CardDragData(isMine: isMine, handIndex: hi, fromSlot: id),
              feedback: Material(
                color: Colors.transparent,
                child: Opacity(opacity: 0.9, child: CardSlot(data: cd, size: cardW * 0.8)),
              ),
              childWhenDragging: Opacity(opacity: 0.25, child: CardSlot(data: cd, size: cardW)),
              onDragEnd: (_) => _clearDragHighlights(),
              child: card,
            )
          : card;
      return DragTarget<CardDragData>(
        onWillAcceptWithDetails: (details) {
          final d = details.data;
          if (d.isMine != isMine) return false;
          if (dragOverSlot != id) setState(() => dragOverSlot = id);
          return true;
        },
        onAcceptWithDetails: (details) => applySlotDrop(details.data, isMine, id),
        onLeave: (d) { if (dragOverSlot == id) setState(() => dragOverSlot = null); },
        builder: (context, candidate, rejected) {
          final over = dragOverSlot == id && candidate.isNotEmpty;
          return Container(
            width: cardW,
            height: cardH,
            decoration: over
                ? BoxDecoration(border: Border.all(color: const Color(0xFFFFD24A), width: 2), borderRadius: BorderRadius.circular(4))
                : null,
            child: draggable,
          );
        },
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Column(children: [
        SizedBox(width: cardW, height: cardH, child: slot(isMine ? 'u0' : 't0')),
        const SizedBox(height: 5),
        for (var r = 0; r < 3; r++)
          Padding(
            padding: EdgeInsets.only(bottom: r < 2 ? gap : 0),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var c = 0; c < 2; c++)
                Padding(
                  padding: EdgeInsets.only(left: c > 0 ? gap : 0),
                  child: slot('${isMine ? "u" : "t"}${r * 2 + c + 1}'),
                ),
            ]),
          ),
      ]),
    );
  }

  // ------------------------------------------------------- 手牌区
  Widget buildHandGroup(bool isMine, String moduleId) {
    final hand = handCards(isMine);
    final chariot = proj?[isMine ? 'myChariot' : 'teammateChariot'] as Map<String, dynamic>?;
    final dr = AppData.chariotSideDr(chariot);
    final mainN = chariot?['main'] ?? 1;
    final subN = chariot?['sub'] ?? 0;
    final mainLv = chariot?['mainLv'] ?? 1;
    final scale = LayoutConfig.I.scaleOf(moduleId);
    final boxW = MediaQuery.of(context).size.width - 22;
    final g = 4.0;
    final baseCw = (boxW - g * 4) / 5;
    final cw = baseCw * scale;
    final ch = cw * 0.82;   // 之前 0.65 太扁，放大后名字看得清

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(children: [
        Row(children: [
          Text('${hand.length}/10',
              style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: isMine ? const Color(0xFF67D2F5) : const Color(0xFFC79BF0))),
          const Spacer(),
          GestureDetector(
            onTap: () => showChariotDialog(chariot, isMine),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: const Color(0x33FFD24A), borderRadius: BorderRadius.circular(5)),
              child: Text('🚂 $mainN/$subN Lv$mainLv 🛡${dr.toStringAsFixed(1)}%',
                  style: const TextStyle(fontSize: 8.5, color: Color(0xFFFFD24A))),
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: () => showPoolDialog(isMine),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: const Color(0xFF2BB3A3), borderRadius: BorderRadius.circular(5)),
              child: const Text('🎴 卡池', style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withAlpha(20), borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.white.withAlpha(25))),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              for (var r = 0; r < 2; r++)
                Padding(
                  padding: EdgeInsets.only(top: r > 0 ? g : 0, left: 2, right: 2, bottom: 2),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    for (var c = 0; c < 5; c++)
                      Padding(
                        padding: EdgeInsets.only(left: c > 0 ? g : 0),
                        child: Builder(builder: (_) {
                        final idx = r * 5 + c;
                        final hasCard = idx < hand.length;
                        final placed = hasCard ? ((hand[idx] as Map<String, dynamic>)['placed']?.toString() ?? '') : '';
                        final onField = placed.isNotEmpty && placed != 'null';
                        final cd = hasCard ? parseCard(hand[idx], isMine, proj!, pack: SkinPack.I) : CardData();
                        final cell = GestureDetector(
                          onTap: () {
                            if (!hasCard) { showPoolDialog(isMine); return; }
                            if (onField) { showCardSettings(cd, isMine, idx); }
                            else { autoPlace(isMine, idx); }
                          },
                          onLongPress: () { if (hasCard) showCardSettings(cd, isMine, idx); },
                          child: CardSlot(data: cd, size: cw, dimmed: onField),
                        );
                        final draggable = hasCard
                            ? Draggable<CardDragData>(
                                data: CardDragData(isMine: isMine, handIndex: idx, fromSlot: onField ? placed : null),
                                feedback: Material(
                                  color: Colors.transparent,
                                  child: Opacity(opacity: 0.9, child: CardSlot(data: cd, size: cw * 0.8, dimmed: onField)),
                                ),
                                childWhenDragging: Opacity(opacity: 0.25, child: CardSlot(data: cd, size: cw, dimmed: onField)),
                                onDragEnd: (_) => _clearDragHighlights(),
                                child: cell,
                              )
                            : cell;
                        return DragTarget<CardDragData>(
                          onWillAcceptWithDetails: (details) {
                            final d = details.data;
                            if (d.isMine != isMine) return false;
                            if (dragOverHandIdx != idx) setState(() => dragOverHandIdx = idx);
                            return true;
                          },
                          onAcceptWithDetails: (details) => applyHandDrop(details.data, isMine, idx),
                          onLeave: (d) { if (dragOverHandIdx == idx) setState(() => dragOverHandIdx = null); },
                          builder: (context, candidate, rejected) {
                            final over = dragOverHandIdx == idx && candidate.isNotEmpty;
                            return Container(
                              width: cw,
                              height: ch,
                              decoration: over
                                  ? BoxDecoration(border: Border.all(color: const Color(0xFF2BB3A3), width: 2), borderRadius: BorderRadius.circular(4))
                                  : null,
                              child: draggable,
                            );
                          },
                        );
                      }),
                    ),
                ]),
              ),
          ]),
        ),
        ),
      ]),
    );
  }

  void showChariotDialog(Map<String, dynamic>? c, bool isMine) {
    final buf = StringBuffer();
    if (c == null) {
      buf.write('这个阵容没保存战车数据（旧版分享）。\n默认按主战车 1 / 副战车 0 计算减伤。');
    } else {
      buf.writeln('主战车：${c['main']} 号${c['main'] == 11 ? "（走马江湖号）" : ""}  Lv${c['mainLv'] ?? 1}');
      buf.writeln('副战车：${((c['sub'] ?? 0) as int) <= 0 ? "未设置" : "${c['sub']} 号"}');
      buf.writeln('减伤：${AppData.chariotSideDr(c)}%');
      buf.write('\n（只有「走马江湖号」计减伤；主车 3×等级+6，副车再乘融合系数）');
    }
    showDialog(context: context, builder: (_) => AlertDialog(
      title: Text(isMine ? '我方战车' : '队友战车'),
      content: Text(buf.toString(), style: const TextStyle(fontSize: 12, height: 1.5)),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭'))],
    ));
  }

  // ------------------------------------------------------- 卡池
  void showPoolDialog(bool isMine) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF16162C),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => PoolSheet(isMine: isMine, proj: proj!, onAdded: () { refresh(); persistProject(); }),
    );
  }

  // ------------------------------------------------------- 设置面板
  void showCardSettings(CardData cd, bool isMine, int handIdx) {
    final hand = handCards(isMine);
    if (handIdx >= hand.length) return;
    final cardObj = hand[handIdx] as Map<String, dynamic>;
    final placed = (cardObj['placed']?.toString() ?? '');
    final onField = placed.isNotEmpty && placed != 'null';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF16162C),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => SettingsSheet(
        isMine: isMine, handIdx: handIdx, cardObj: cardObj, proj: proj!,
        onField: onField,
        onChanged: () { refresh(); persistProject(); },
        onPlace: () { Navigator.pop(context); autoPlace(isMine, handIdx); },
        onTakeOff: () { Navigator.pop(context); takeOff(isMine, handIdx); },
        onRemove: () { Navigator.pop(context); hand.removeAt(handIdx); refresh(); },
      ),
    );
  }
}

class _DisabledBox extends StatelessWidget {
  final String text;
  const _DisabledBox(this.text);
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 30,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(color: const Color(0xFF1E1E36), borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: const TextStyle(fontSize: 11, color: Colors.white38), overflow: TextOverflow.ellipsis),
    );
  }
}
