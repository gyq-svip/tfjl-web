import 'dart:convert';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
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
import 'floating_panel.dart';
import 'notepad_sheet.dart';
import 'script_sheet.dart';
import 'activity_calc.dart';
import 'calc_sheet.dart';
import 'mobile_heartbeat.dart';
import 'version_check.dart';
import 'backup_transfer.dart';
import 'dr_system.dart';

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

class _HomePageState extends State<HomePage> with SingleTickerProviderStateMixin {
  late AnimationController _wiggleCtrl;  // 编辑态抖动动画
  bool layoutEditing = false;            // 默认锁定
  bool topBarAutoHide = false;           // 顶栏自动隐藏（可开关）
  bool topBarExpanded = true;            // 下拉行当前是否展开
  int navTab = 0;                        // 底部 TAB：0主页 1工具 2设置
  bool poolSideMine = true;              // 悬浮卡池当前服务哪一侧
  bool poolOverlayOpen = false;          // 悬浮卡池是否显示
  bool notepadOverlayOpen = false;       // 悬浮记事本是否显示
  bool scriptOverlayOpen = false;        // 悬浮脚本生成是否显示
  bool calcOverlayOpen = false;          // 悬浮计算器是否显示
  final ActivityCalc _activityCalc = ActivityCalc();  // 活动配置（云端读+默认兜底）
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
    _wiggleCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();
    _init();
  }

  @override
  void dispose() {
    _wiggleCtrl.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    await AppData.I.load();
    await LayoutConfig.I.load();
    _activityCalc.load();   // 活动配置后台加载（缓存秒开）
    _loadQuick();           // 顶栏快捷功能配置
    DrSystem.load();        // 减伤表（洗炼/特殊技能）
    // 用户昵称（注册制，与网页 TFJL_UserName 同键；老用户旧键兼容兜底）
    final prefs0 = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() => _userNick = (prefs0.getString('TFJL_UserName') ?? '').isNotEmpty
          ? prefs0.getString('TFJL_UserName')!
          : (prefs0.getString('mobile_heartbeat_nick') ?? ''));
    }
    // 管理员远程改名（对齐网页 applyServerNickOverride：diag 里 nickManagedByAdmin → 覆盖本地）
    MobileHeartbeat.I.applyAdminNickOverride().then((changed) {
      if (!changed || !mounted) return;
      SharedPreferences.getInstance().then((p) {
        if (mounted) setState(() => _userNick = p.getString('TFJL_UserName') ?? _userNick);
      });
    });
    MobileHeartbeat.I.start();   // 手机在线心跳（后台，成功后管理员面板显示📱）
    SkinPack.I.onProgress = (p, s) {
      if (!SkinPack.I.ready && mounted) setState(() { packPct = p; loadStage = s; });
    };
    final prefs = await SharedPreferences.getInstance();
    lastLocalName = prefs.getString('lastLocal') ?? '';
    topBarAutoHide = prefs.getBool('topbar_autohide') ?? false;
    topBarExpanded = !topBarAutoHide;   // 开了自动隐藏则默认收起
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
    // APP 内版本检测（Gitee 托管安装包，只留最新一版；有新版弹窗引导下载）
    if (mounted) VersionCheck.check(context);
  }

  List<dynamic> handCards(bool isMine) =>
      List<dynamic>.from(proj?[isMine ? 'myHandCards' : 'teammateHandCards'] ?? []);

  void refresh() => setState(() {});

  /// 共享项目改动持久化（共享模式不写本地库）
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

  /// ☁ 共享阵容一键复制到本地（含记事本/脚本/站位），复制后切到本地模式自由微调
  Future<void> _copyShareToLocal() async {
    if (proj == null) return;
    String name = '${proj!['name'] ?? '共享阵容'}·本地';
    // 重名自动加序号
    final lib = await ProjectLibrary.load();
    final names = lib.map((e) => (e as Map)['name']?.toString() ?? '').toSet();
    for (var i = 2; names.contains(name); i++) {
      name = '${proj!['name'] ?? '共享阵容'}·本地$i';
    }
    final copy = Map<String, dynamic>.from(proj!);
    copy['name'] = name;
    copy['category'] = proj!['category']?.toString().isNotEmpty == true ? proj!['category'] : '共享备份';
    await ProjectLibrary.addProject(copy['category'].toString(), name, copy);
    SharedPreferences.getInstance().then((p) => p.setString('lastLocal', name));
    setState(() {
      proj = copy;
      sourceMode = 0;
      gistId = '';
      lastLocalName = name;
      navTab = 0;
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('✅ 已复制为本地项目「$name」，现在可以自由微调了'),
        duration: const Duration(seconds: 2)));
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
  /// 顶栏第一行（常驻）：标题 + 快捷功能 chips +（收起时）项目名/唤出按钮
  /// 🔴 自动隐藏关闭时：下拉选择行跟在第一行下面常驻显示（修复：重构后漏加回导致项目菜单调不出来）
  Widget buildTopBar() {
    return Container(
      color: const Color(0xFF12122A),
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      child: Column(children: [
        SizedBox(
          height: 30,
          child: Row(children: [
            const Text('🛡 塔防助手', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Colors.white)),
            // 当前项目名（收起时也能看到选了哪个）
            if (topBarAutoHide && !topBarExpanded)
              Padding(
                padding: const EdgeInsets.only(left: 6),
                child: Text('${proj?['name'] ?? ''}',
                    style: const TextStyle(fontSize: 10, color: Color(0xFFFFD24A)),
                    overflow: TextOverflow.ellipsis),
              ),
            // 唤出按钮（自动隐藏且收起时显示）
            if (topBarAutoHide && !topBarExpanded)
              GestureDetector(
                onTap: () => setState(() => topBarExpanded = true),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Icon(Icons.expand_more, size: 18, color: Color(0xFF2BB3A3)),
                ),
              ),
            const Spacer(),
            // 可编辑快捷功能 chips（长按任意 chip 打开显隐编辑）
            Expanded(
              child: _quickActionsRow(),
            ),
          ]),
        ),
        if (!topBarAutoHide) ...[
          const SizedBox(height: 4),
          SizedBox(height: 30, child: _buildSelectorRow()),
        ],
      ]),
    );
  }

  /// 下拉选择行（本地/共享 → 分类 → 项目）：自动隐藏开启时收进悬浮层，关闭时常驻布局
  Widget _buildSelectorRow() {
    final fromShare = sourceMode == 1;
    return Row(children: [
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
              if (sourceMode == 0) { gistId = ''; _loadLocalCurrent(); }
              if (sourceMode == 1 && shareIndex == null) _loadShareIndex();
            });
            // 切换本地/共享不收起悬浮层（还要接着选阵容），选完阵容才收
          },
        ),
      ),
      const SizedBox(width: 4),
      if (!fromShare) ..._localSelectors(onPicked: _maybeCollapseTopBar) else ..._shareSelectors(onPicked: _maybeCollapseTopBar),
      // 收起按钮（自动隐藏时）
      if (topBarAutoHide)
        GestureDetector(
          onTap: () => setState(() => topBarExpanded = false),
          child: const Padding(
            padding: EdgeInsets.only(left: 4),
            child: Icon(Icons.expand_less, size: 18, color: Color(0xFF2BB3A3)),
          ),
        ),
    ]);
  }

  /// 🔴 悬浮下拉选择行（自动隐藏开启 + 展开时）：浮在内容之上，不挤占布局
  Widget _buildFloatingSelectors() {
    return Positioned(
      top: 0, left: 0, right: 0,
      child: SafeArea(
        bottom: false,
        child: Container(
          margin: const EdgeInsets.only(top: 30),   // 让出常驻第一行
          padding: const EdgeInsets.fromLTRB(8, 5, 8, 5),
          decoration: BoxDecoration(
            color: const Color(0xFF12122A),
            boxShadow: [BoxShadow(color: Colors.black.withAlpha(90), blurRadius: 10, offset: const Offset(0, 3))],
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(10)),
          ),
          child: SizedBox(height: 30, child: _buildSelectorRow()),
        ),
      ),
    );
  }

  /// 选完项目后自动收起顶栏（仅自动隐藏开启时）
  void _maybeCollapseTopBar() {
    if (topBarAutoHide && mounted) setState(() => topBarExpanded = false);
  }

  // ------------------------------------------------------- 顶栏快捷功能（可编辑）
  static const _quickDefs = <String, List<String>>{
    'notepad': ['📝', '记事本'],
    'library': ['📚', '阵容图库'],
    'script': ['📜', '脚本'],
    'calc': ['🧮', '计算器'],
    'pool': ['🎴', '卡池'],
    'netcheck': ['🌐', '自检'],
    'layout': ['✎', '布局'],
  };
  static const _quickDefaults = ['notepad', 'library', 'script'];
  List<String> _quickOrder = [];

  Future<void> _loadQuick() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getStringList('quick_actions') ?? _quickDefaults;
    // 过滤掉定义里已不存在的 key
    _quickOrder = saved.where((k) => _quickDefs.containsKey(k)).toList();
    if (mounted) setState(() {});
  }

  Future<void> _saveQuick() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('quick_actions', _quickOrder);
  }

  void _runQuick(String key) {
    switch (key) {
      case 'notepad': setState(() => notepadOverlayOpen = true);
      case 'library': Navigator.push(context, MaterialPageRoute(builder: (_) => const LibraryPage()));
      case 'script': setState(() => scriptOverlayOpen = true);
      case 'calc': setState(() => calcOverlayOpen = true);
      case 'pool': setState(() => poolOverlayOpen = true);
      case 'netcheck': _showNetCheck();
      case 'layout': setState(() => layoutEditing = !layoutEditing);
    }
  }

  /// 长按/编辑：勾选要显示的快捷功能
  void _editQuickActions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1A1A2E),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Container(
            padding: const EdgeInsets.all(14),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('⚙️ 编辑快捷功能', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
              const SizedBox(height: 4),
              const Text('勾选显示在顶栏，按住拖动排序暂不支持，最多 5 个',
                  style: TextStyle(fontSize: 10, color: Colors.white38)),
              const SizedBox(height: 8),
              Wrap(spacing: 7, runSpacing: 7, children: [
                for (final e in _quickDefs.entries)
                  GestureDetector(
                    onTap: () {
                      setSheet(() {
                        if (_quickOrder.contains(e.key)) {
                          _quickOrder.remove(e.key);
                        } else {
                          if (_quickOrder.length < 5) _quickOrder.add(e.key);
                        }
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: _quickOrder.contains(e.key) ? const Color(0xFF2BB3A3) : Colors.white.withAlpha(35),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text('${e.value[0]} ${e.value[1]}',
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold,
                              color: _quickOrder.contains(e.key) ? const Color(0xFF07231F) : Colors.white70)),
                    ),
                  ),
              ]),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () { _saveQuick(); Navigator.pop(ctx); if (mounted) setState(() {}); },
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2BB3A3)),
                  child: const Text('完成', style: TextStyle(color: Color(0xFF07231F), fontWeight: FontWeight.bold)),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _quickActionsRow() {
    if (_quickOrder.isEmpty) {
      return GestureDetector(
        onTap: _editQuickActions,
        child: const Align(alignment: Alignment.centerRight,
            child: Text('＋ 快捷功能', style: TextStyle(fontSize: 10, color: Color(0xFF2BB3A3)))),
      );
    }
    return Row(children: [
      for (final k in _quickOrder.take(5))
        GestureDetector(
          onTap: () => _runQuick(k),
          onLongPress: _editQuickActions,
          child: Container(
            width: 30, height: 26, margin: const EdgeInsets.only(left: 4), alignment: Alignment.center,
            decoration: BoxDecoration(color: Colors.white.withAlpha(28), borderRadius: BorderRadius.circular(6)),
            child: Text(_quickDefs[k]![0], style: const TextStyle(fontSize: 12.5)),
          ),
        ),
      GestureDetector(
        onTap: _editQuickActions,
        child: const Padding(padding: EdgeInsets.only(left: 3),
            child: Icon(Icons.tune, size: 13, color: Color(0xFF6C7A92))),
      ),
    ]);
  }

  InputDecoration _ddDecor() => InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        filled: true,
        fillColor: const Color(0xFF1E1E36),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
      );

  List<Widget> _localSelectors({VoidCallback? onPicked}) {
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
                    onPicked?.call();
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

  List<Widget> _shareSelectors({VoidCallback? onPicked}) {
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
                  onPicked?.call();   // 选完立即收起顶栏让出空间
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
      content: SingleChildScrollView(child: Text(
        '【界面总览】\n'
        '· 底部三个 TAB：🏠主页（阵容画布）/ 🧰工具 / ⚙️设置\n'
        '· 顶栏右侧的图标是快捷功能，点一下直达；点最右 ⚙ 图标可编辑显示哪些\n\n'
        '【上下卡】\n'
        '· 点手牌里未上阵的卡 → 自动按顺序上阵\n'
        '· 点卡槽里的卡 → 取下回手牌\n'
        '· 已上阵的卡在手牌里变灰\n\n'
        '【设置（等级/皮肤/魔化/融合）】\n'
        '· 长按手牌或卡槽里的卡 → 设置面板\n'
        '· 点已上阵（变灰）的卡也能打开\n\n'
        '【卡池】\n'
        '· 点手牌标题旁「🎴 卡池」→ 悬浮卡池面板（可拖动/缩放）\n'
        '· 点卡直接加手牌并上阵（长按只加手牌）\n'
        '· 同一张卡（含融合形态）只能带 1 张\n\n'
        '【自由拖动布局】\n'
        '· 「编辑布局」进入编辑态（卡片抖动）：拖标题移动、拖右下角缩放\n'
        '· 横屏/竖屏各存一套布局\n'
        '· 顶栏自动隐藏开启时顶栏悬浮弹出，不挤占卡片区\n\n'
        '【项目与共享】\n'
        '· 顶栏下拉：本地/共享 → 分类 → 项目\n'
        '· ☁ 共享阵容点「📋 复制到本地」→ 整套复制（含记事本/脚本/站位），自由微调\n'
        '· 共享项目的记事本只读，复制到本地后可编辑\n'
        '· 阵容图库（工具页）：精选/活动/大航海，「用此阵容」导入本地\n\n'
        '【脚本】\n'
        '· 生成：输入阵容文本 → 活动/隐藏榜/深海脚本（自动适配老马短名）\n'
        '· 解析上卡：粘贴老马脚本 → 选「我的/队友」→ 解析上卡，按波次模拟最终站位直接上阵\n\n'
        '【个人】\n'
        '· 注册昵称（与网页一致，注册后改名找管理员）\n'
        '· 生成邀请码：6位一次性，30分钟有效，每天5个\n\n'
        '【更新】\n'
        '· 设置 → 检查更新：安卓应用内下载自动安装；iPhone 复制直链到全能签安装',
        style: TextStyle(fontSize: 12, height: 1.5))),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('知道了'))],
    ));
  }

  // ------------------------------------------------------- 页面
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF2BB3A3)))
          : IndexedStack(index: navTab, children: [
              _homeBody(),   // 0 主页：画布 + 悬浮面板
              _toolsPage(),  // 1 工具
              _settingsPage(), // 2 设置
            ]),
      bottomNavigationBar: loading ? null : _bottomNav(),
    );
  }

  /// 底部 TAB 导航（主页 / 工具 / 设置）
  Widget _bottomNav() {
    Widget item(int idx, String icon, String label) {
      final on = navTab == idx;
      return Expanded(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => setState(() => navTab = idx),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(icon, style: TextStyle(fontSize: 17, color: on ? const Color(0xFF2BB3A3) : Colors.white38)),
            const SizedBox(height: 1),
            Text(label, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold,
                color: on ? const Color(0xFF2BB3A3) : Colors.white38)),
          ]),
        ),
      );
    }
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF12122A),
        border: Border(top: BorderSide(color: Color(0xFF2BB3A3), width: 0.5)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 48,
          child: Row(children: [
            item(0, '🏠', '主页'),
            item(1, '🧰', '工具'),
            item(2, '⚙️', '设置'),
          ]),
        ),
      ),
    );
  }

  /// 主页画布（原 build 主体）
  Widget _homeBody() {
    return Stack(children: [
        SafeArea(
        child: Column(children: [
                buildTopBar(),   // 第一行常驻（标题+快捷chips；关闭自动隐藏时下拉行也在这里）
                if (packPct >= 0) _packProgress(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Row(children: [
                    Text('⚔ ${proj?['name'] ?? '出战选择'}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
                    const Spacer(),
                    // 共享模式：一键复制到本地（含记事本/脚本/站位，复制后可自由微调）
                    if (sourceMode == 1)
                      GestureDetector(
                        onTap: _copyShareToLocal,
                        child: Container(
                          margin: const EdgeInsets.only(right: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(color: const Color(0xFF7986CB), borderRadius: BorderRadius.circular(6)),
                          child: const Text('📋 复制到本地', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: Colors.white)),
                        ),
                      ),
                    if (layoutEditing)
                      const Text('编辑中', style: TextStyle(fontSize: 9, color: Color(0xFFFFD24A))),
                    if (layoutEditing)
                      GestureDetector(
                        onTap: () async {
                          await LayoutConfig.I.reset(MediaQuery.of(context).orientation == Orientation.landscape);
                          setState(() {});
                        },
                        child: const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 5),
                          child: Text('重置', style: TextStyle(fontSize: 9, color: Color(0xFFFF8A80))),
                        ),
                      ),
                  ]),
                ),
                Expanded(
                  child: LayoutBuilder(builder: (context, constraints) {
                    final isLand = MediaQuery.of(context).orientation == Orientation.landscape;
                    return Stack(children: [
                      for (final id in LayoutConfig.moduleIds)
                        _buildFreeModule(id, constraints.maxWidth, constraints.maxHeight, isLand),
                    ]);
                  }),
                ),
              ]),
        ),  // SafeArea
        // 🔴 悬浮下拉选择行（自动隐藏开启且展开时）：浮在内容之上，不挤占布局
        if (topBarAutoHide && topBarExpanded && proj != null) _buildFloatingSelectors(),
        // 🔴 编辑布局模式：悬浮「完成/重置」条（完成按钮在这里，不用回设置）
        if (layoutEditing)
          Positioned(
            left: 0, right: 0, bottom: 10,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1A2E),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: const Color(0xFFFFD24A), width: 0.8),
                  boxShadow: [BoxShadow(color: Colors.black.withAlpha(120), blurRadius: 12, offset: const Offset(0, 3))],
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Padding(padding: EdgeInsets.symmetric(horizontal: 6),
                      child: Text('✎ 编辑中：拖标题移动 · 拖右下角缩放',
                          style: TextStyle(fontSize: 10, color: Color(0xFFFFD24A)))),
                  GestureDetector(
                    onTap: () => setState(() => layoutEditing = false),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                      decoration: BoxDecoration(color: const Color(0xFFFFD24A), borderRadius: BorderRadius.circular(14)),
                      child: const Text('✓ 完成',
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF1A1A2E))),
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () async {
                      await LayoutConfig.I.reset(MediaQuery.of(context).orientation == Orientation.landscape);
                      if (mounted) setState(() {});
                    },
                    child: const Padding(padding: EdgeInsets.symmetric(horizontal: 6),
                        child: Text('↺ 重置', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFF8A80)))),
                  ),
                ]),
              ),
            ),
          ),
        // 悬浮卡池（可拖动/缩放，不挡全屏）
        if (poolOverlayOpen && proj != null)
          FloatingPanel(
            storageKey: 'floating_panel_pool',
            title: poolSideMine ? '🎴 卡池 · 我的（点卡加手牌）' : '🎴 卡池 · 队友（点卡加手牌）',
            accent: poolSideMine ? const Color(0xFF67D2F5) : const Color(0xFFC79BF0),
            onClose: () => setState(() => poolOverlayOpen = false),
            defaultRect: const Rect.fromLTWH(0.10, 0.14, 0.80, 0.68),
            child: PoolSheet(isMine: poolSideMine, proj: proj!, embedded: true,
                onAdded: () { refresh(); persistProject(); },
                onSwitchSide: () => setState(() => poolSideMine = !poolSideMine)),
          ),
        // 悬浮记事本
        if (notepadOverlayOpen && proj != null)
          FloatingPanel(
            storageKey: 'floating_panel_notepad',
            title: '📝 记事本 · ${proj?['name'] ?? ''}',
            accent: const Color(0xFF9BE9E0),
            onClose: () => setState(() => notepadOverlayOpen = false),
            defaultRect: const Rect.fromLTWH(0.18, 0.18, 0.66, 0.62),
            child: NotepadSheet(proj: proj!, readOnly: gistId.isNotEmpty, onChanged: persistProject),
          ),
        // 悬浮脚本生成
        if (scriptOverlayOpen)
          FloatingPanel(
            storageKey: 'floating_panel_script',
            title: '📜 脚本生成（活动/隐藏榜/深海）',
            accent: const Color(0xFFFF9800),
            onClose: () => setState(() => scriptOverlayOpen = false),
            defaultRect: const Rect.fromLTWH(0.06, 0.10, 0.88, 0.80),
            child: ScriptSheet(proj: proj!, onChanged: persistProject),
          ),
        // 悬浮活动计算器
        if (calcOverlayOpen)
          FloatingPanel(
            storageKey: 'floating_panel_calc',
            title: '🧮 活动计算器（商品后台读取）',
            accent: const Color(0xFF4CAF50),
            onClose: () => setState(() => calcOverlayOpen = false),
            defaultRect: const Rect.fromLTWH(0.08, 0.10, 0.84, 0.80),
            child: CalcSheet(calc: _activityCalc),
          ),
      ]);  // Stack
  }

  // ------------------------------------------------------- 🧰 工具页（底部 TAB）
  Widget _toolsPage() {
    Widget tool(String icon, String title, String sub, VoidCallback onTap, {Color accent = const Color(0xFF2BB3A3)}) {
      return GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.fromLTRB(10, 0, 10, 8),
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(12),
              border: Border.all(color: accent.withAlpha(40))),
          child: Row(children: [
            Text(icon, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
              const SizedBox(height: 2),
              Text(sub, style: const TextStyle(fontSize: 10, color: Colors.white38)),
            ])),
            const Icon(Icons.chevron_right, size: 18, color: Colors.white24),
          ]),
        ),
      );
    }
    return SafeArea(
      child: Column(children: [
        const Padding(padding: EdgeInsets.all(12), child: Align(alignment: Alignment.centerLeft,
            child: Text('🧰 工具 v${AppData.appVersion}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))))),
        Expanded(
          child: SingleChildScrollView(
            child: Column(children: [
              tool('📚', '阵容图库', '精选 · 活动 7 天 A/B · 大航海 223 套', () { Navigator.push(context, MaterialPageRoute(builder: (_) => const LibraryPage())); },
                  accent: const Color(0xFF4ECDC4)),
              tool('📖', '使用说明', '上下卡 / 设置 / 卡池的用法', _showHelp, accent: const Color(0xFF7986CB)),
              tool('📝', '记事本', '当前阵容的笔记，随项目走、自动保存', () => setState(() { navTab = 0; notepadOverlayOpen = true; }),
                  accent: const Color(0xFF9BE9E0)),
              tool('📜', '脚本生成', '活动/隐藏榜/深海 · 照搬网页规则，自动适配老马', () => setState(() { navTab = 0; scriptOverlayOpen = true; }),
                  accent: const Color(0xFFFF9800)),
              tool('🧮', '活动计算器', '商品从后台读取，动态规划算最优购买', () => setState(() { navTab = 0; calcOverlayOpen = true; }),
                  accent: const Color(0xFF4CAF50)),
              tool('🌐', '网络自检', '共享打不开？测一下是哪个环节不通', _showNetCheck, accent: const Color(0xFF67D2F5)),
              tool('🛡', '减伤表管理', '洗炼减伤 / 小野酋长宝库特殊技能（我的·队友）', () {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const DrManagePage()));
              }, accent: const Color(0xFF4ade80)),
              tool('✎', '编辑布局', '自由拖动/缩放各模块位置和大小', () => setState(() { navTab = 0; layoutEditing = !layoutEditing; }),
                  accent: const Color(0xFFFFD24A)),
              tool('📥', '导入 PC 备份', '选 PC 端导出的 TFJL-backup-*.json，恢复全部阵容', () async {
                final r = await BackupTransfer.importFromPc(context);
                if (r.isNotEmpty && mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r), duration: const Duration(seconds: 3)));
                }
              }, accent: const Color(0xFF67D2F5)),
              tool('📤', '导出阵容备份', '导出 PC 兼容 TFJL-backup-*.json，PC 端可一键恢复', () async {
                final r = await BackupTransfer.exportToPc(context);
                if (r.isNotEmpty && mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r), duration: const Duration(seconds: 3)));
                }
              }, accent: const Color(0xFF4CAF50)),
              const SizedBox(height: 8),
            ]),
          ),
        ),
      ]),
    );
  }

  // ------------------------------------------------------- ⚙️ 设置页（底部 TAB）
  String _userNick = '';

  Widget _settingsPage() {
    return SafeArea(
      child: ListView(padding: const EdgeInsets.fromLTRB(10, 10, 10, 20), children: [
        const Padding(padding: EdgeInsets.only(left: 4, bottom: 8),
            child: Text('⚙️ 设置', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A)))),
        // 个人中心（围绕个人用户加功能：昵称 → 邀请码 → 后期扩展）
        _settingsSection('个人'),
        Container(margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(12)),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _userNick.isEmpty ? _registerNick : null,
            child: Row(children: [
              const Text('👤', style: TextStyle(fontSize: 18)),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_userNick.isEmpty ? '点击注册昵称' : _userNick,
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold,
                        color: _userNick.isEmpty ? const Color(0xFF2BB3A3) : Colors.white)),
                const SizedBox(height: 2),
                Text(_userNick.isEmpty ? '注册后用于邀请码、心跳、共享记录（与网页账号一致）' : '注册昵称 · 与网页一致，改名请联系管理员',
                    style: const TextStyle(fontSize: 10, color: Colors.white38)),
              ])),
              if (_userNick.isEmpty)
                const Icon(Icons.chevron_right, size: 18, color: Color(0xFF2BB3A3)),
            ]),
          ),
        ),
        _settingsRow('🎁', '生成邀请码', '6位一次性邀请码（每天5个，30分钟有效）', _generateInvite),
        // 界面
        _settingsSection('界面'),
        _settingsRow('✎', '编辑布局', '自由拖动/缩放各模块位置和大小（主页进入编辑态）', () {
          setState(() { navTab = 0; layoutEditing = !layoutEditing; });
        },
            trailing: Text(layoutEditing ? '编辑中' : '关', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold,
                color: layoutEditing ? const Color(0xFFFFD24A) : Colors.white38))),
        Container(margin: const EdgeInsets.fromLTRB(0, 0, 0, 10), padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(12)),
          child: StatefulBuilder(builder: (ctx, setSheet) => SwitchListTile(
            value: topBarAutoHide,
            activeColor: const Color(0xFF2BB3A3),
            title: const Text('顶栏自动隐藏', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
            subtitle: const Text('开：顶栏悬浮弹出，不挤占布局；点顶部 ▾ 或下滑唤出，选完自动收起', style: TextStyle(fontSize: 10, color: Colors.white38)),
            onChanged: (v) async {
              setState(() { topBarAutoHide = v; topBarExpanded = !v; });
              setSheet(() {});
              final prefs = await SharedPreferences.getInstance();
              await prefs.setBool('topbar_autohide', v);
            },
          )),
        ),
        // 更新
        _settingsSection('更新'),
        _settingsRow('🔄', '检查更新', '有新版弹窗：安卓自动安装 / iPhone 复制全能签直链', () async {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('正在检查更新…'), duration: Duration(seconds: 1)));
          await VersionCheck.manualCheck(context);
        }),
        _settingsRow('📦', '当前版本', 'v${AppData.appVersion}', () {},
            trailing: Text('v${AppData.appVersion}', style: const TextStyle(fontSize: 11, color: Color(0xFF2BB3A3), fontWeight: FontWeight.bold))),
        // 网络
        _settingsSection('网络'),
        _settingsRow('🌐', '网络自检', '共享打不开？逐环节测试定位问题', _showNetCheck),
        // 关于
        _settingsSection('关于'),
        _settingsRow('📖', '使用说明', '上下卡 / 设置 / 卡池的用法', _showHelp),
      ]),
    );
  }

  /// 👤 注册昵称（一次性，与网页 TFJL_UserName 同键同义；注册后改名找管理员）
  Future<void> _registerNick() async {
    final ctl = TextEditingController(text: _userNick);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: const [
          Icon(Icons.person_add, color: Color(0xFF2BB3A3)),
          SizedBox(width: 8),
          Text('注册昵称', style: TextStyle(color: Colors.white)),
        ]),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('填一个常用昵称（与网页端一致），用于邀请码生成记录、共享心跳 📱 标识。',
              style: TextStyle(color: Colors.white70, fontSize: 12.5, height: 1.5)),
          const SizedBox(height: 10),
          TextField(controller: ctl, autofocus: true, maxLength: 16,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: InputDecoration(hintText: '例如：老王的手机', isDense: true, filled: true,
              fillColor: const Color(0xFF0C0C17), counterText: '',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none)),
          ),
          const SizedBox(height: 6),
          const Text('⚠️ 注册后不可在此修改；管理员可在后台远程改名。',
              style: TextStyle(fontSize: 10.5, color: Colors.white38)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: Text('取消', style: TextStyle(color: Colors.white.withOpacity(0.6)))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2BB3A3)),
            child: const Text('注册', style: TextStyle(color: Color(0xFF07231F), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
    final nick = ctl.text.trim();
    if (ok != true || nick.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('TFJL_UserName', nick);   // 与网页同键；心跳立即用新昵称
    setState(() => _userNick = nick);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✅ 已注册昵称「$nick」'), duration: const Duration(seconds: 2)));
    }
  }

  /// 🎁 生成邀请码（照搬网页个人中心 generate：30分钟有效/一次性/每天5个）
  Future<void> _generateInvite() async {
    final nick = _userNick.trim();
    if (nick.isEmpty) {
      _registerNick();
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('正在生成邀请码…'), duration: Duration(seconds: 1)));
    final r = await InviteClient.generate(nick: nick);
    if (!mounted) return;
    if (r.startsWith('OK:')) {
      final code = r.substring(3);
      showDialog(context: context, builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: const [
          Icon(Icons.card_giftcard, color: Color(0xFFFFD24A)),
          SizedBox(width: 8),
          Text('邀请码已生成', style: TextStyle(color: Colors.white)),
        ]),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          SelectableText(code, style: const TextStyle(fontSize: 32, letterSpacing: 6, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
          const SizedBox(height: 8),
          const Text('30 分钟内有效 · 一次性使用 · 已记录生成人',
              style: TextStyle(fontSize: 11, color: Colors.white38)),
        ]),
        actions: [
          TextButton(
            onPressed: () { Clipboard.setData(ClipboardData(text: code)); Navigator.pop(ctx); },
            child: const Text('复制', style: TextStyle(color: Color(0xFF2BB3A3))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('关闭', style: TextStyle(color: Colors.white.withOpacity(0.6))),
          ),
        ],
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('❌ $r'), duration: const Duration(seconds: 3)));
    }
  }

  Widget _settingsSection(String title) => Padding(padding: const EdgeInsets.fromLTRB(4, 6, 0, 5),
      child: Text(title, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF6C7A92))));

  Widget _settingsRow(String icon, String title, String sub, VoidCallback onTap, {Widget? trailing}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: const Color(0xFF15152A), borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Text(icon, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 2),
            Text(sub, style: const TextStyle(fontSize: 10, color: Colors.white38)),
          ])),
          if (trailing != null) trailing,
        ]),
      ),
    );
  }

  /// 自由定位模块：拖标题移动位置、拖右下角缩放宽高（像桌面窗口）
  Widget _buildFreeModule(String moduleId, double canvasW, double canvasH, bool isLandscape) {
    final rects = LayoutConfig.I.current(isLandscape);
    final r = rects[moduleId]!;
    final isMine = moduleId == 'myField' || moduleId == 'myHand';
    final isField = moduleId.endsWith('Field');
    final accent = isMine ? const Color(0xFF67D2F5) : const Color(0xFFC79BF0);
    final left = r.left * canvasW;
    final top = r.top * canvasH;
    final width = r.width * canvasW;
    final height = r.height * canvasH;

    return Positioned(
      left: left, top: top, width: width, height: height,
      child: AnimatedBuilder(
        animation: _wiggleCtrl,
        builder: (context, child) {
          // 编辑态：左右轻微摆动（像手机桌面整理图标）
          final wiggle = layoutEditing
              ? (Curves.easeInOut.transform((_wiggleCtrl.value * 2) % 1) - 0.5) * 0.022
              : 0.0;
          return Transform.rotate(
            angle: wiggle,
            child: child,
          );
        },
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xF014142A),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: layoutEditing ? const Color(0xFFFFD24A) : accent.withAlpha(60),
              width: layoutEditing ? 2 : 1,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Stack(children: [
              // 内容（留标题栏空间）—— 传模块可用宽高，卡片按比例塞满、全部可见
              Positioned.fill(
                top: 24,
                child: isField
                    ? buildCardGroup(isMine, width, height - 24)
                    : buildHandGroup(isMine, width, height - 24),
              ),
              // 标题栏（拖这里移动模块）
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onPanUpdate: layoutEditing ? (d) {
                  setState(() {
                    final nr = rects[moduleId]!;
                    rects[moduleId] = Rect.fromLTWH(
                      (nr.left + d.delta.dx / canvasW).clamp(0.0, 1.0 - nr.width),
                      (nr.top + d.delta.dy / canvasH).clamp(0.0, 1.0 - nr.height),
                      nr.width, nr.height,
                    );
                  });
                } : null,
                onPanEnd: layoutEditing ? (_) => LayoutConfig.I.save(isLandscape) : null,
                child: Container(
                  height: 24,
                  color: layoutEditing ? const Color(0x40FFD24A) : const Color(0x18FFFFFF),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Row(children: [
                    if (layoutEditing) Icon(Icons.drag_indicator, size: 14, color: const Color(0xFFFFD24A)),
                    const SizedBox(width: 2),
                    Expanded(child: Text(LayoutConfig.moduleNames[moduleId] ?? moduleId,
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: accent),
                        overflow: TextOverflow.ellipsis)),
                    // 🔴 手牌模块：标题栏右侧合并 10/10 + 战车(车名简写+总减伤) + 卡池（省一行）
                    if (moduleId == 'myHand' || moduleId == 'mateHand')
                      ..._handTitleExtras(moduleId == 'myHand'),
                  ]),
                ),
              ),
              // 右下角缩放把手（仅编辑态显示）
              if (layoutEditing)
              Positioned(
                right: 0, bottom: 0,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanUpdate: (d) {
                    setState(() {
                      final nr = rects[moduleId]!;
                      rects[moduleId] = Rect.fromLTWH(
                        nr.left, nr.top,
                        (nr.width + d.delta.dx / canvasW).clamp(0.22, 1.0 - nr.left),
                        (nr.height + d.delta.dy / canvasH).clamp(0.18, 1.0 - nr.top),
                      );
                    });
                  },
                  onPanEnd: (_) => LayoutConfig.I.save(isLandscape),
                  child: Container(
                    width: 26, height: 26,
                    decoration: BoxDecoration(
                      color: const Color(0x552BB3A3),
                      borderRadius: const BorderRadius.only(bottomRight: Radius.circular(10)),
                    ),
                    child: const Icon(Icons.zoom_out_map, size: 18, color: Color(0xFF9BE9E0)),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ),
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
  /// boxW/boxH = 模块内容区可用宽高（已扣标题栏）。卡片按比例缩放，保证 7 张全显示。
  Widget buildCardGroup(bool isMine, double boxW, double boxH) {
    final hand = handCards(isMine);
    var filled = 0;
    for (final c in hand) {
      final pl = (c as Map<String, dynamic>)['placed']?.toString() ?? '';
      if (pl.isNotEmpty && pl != 'null') filled++;
    }
    final gap = 4.0;
    // 布局：1 主卡 + 3 排×2 = 4 行；宽度方向 2 列
    final cardWByWidth = (boxW - 8 - gap) / 2;
    final cardHByHeight = (boxH - 8 - gap * 3) / 4;
    // 卡片保持 0.92 宽高比，取宽高中较小者，确保不溢出
    final cardW = (cardWByWidth < cardHByHeight / 0.92 ? cardWByWidth : cardHByHeight / 0.92).clamp(18.0, 240.0);
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
  /// boxW/boxH = 模块内容区可用宽高。手牌 2 排×5 + 顶部按钮行，按比例塞满、10 张全显示。
  Widget buildHandGroup(bool isMine, double boxW, double boxH) {
    final hand = handCards(isMine);
    final chariot = proj?[isMine ? 'myChariot' : 'teammateChariot'] as Map<String, dynamic>?;
    final drTable = isMine ? '我的' : '队友';
    final bd = DrSystem.breakdown(handCards: hand, tableName: drTable, chariot: chariot);
    final dr = bd['total']!;
    final g = 3.0;
    // 标题栏已合并 10/10 + 战车 + 卡池（不再单独占一行），2 排卡片直接铺满
    final cardWByWidth = (boxW - 6 - g * 4) / 5;
    final cardHByHeight = (boxH - 8 - g) / 2;
    final cw = (cardWByWidth < cardHByHeight / 0.82 ? cardWByWidth : cardHByHeight / 0.82).clamp(16.0, 200.0);
    final ch = cw * 0.82;

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(children: [
        Container(
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
      ]),
    );
  }

  /// 手牌模块标题栏右侧的紧凑信息：10/10 + 🚂车名+总减伤徽章 + 🎴卡池
  List<Widget> _handTitleExtras(bool isMine) {
    final hand = handCards(isMine);
    final chariot = proj?[isMine ? 'myChariot' : 'teammateChariot'] as Map<String, dynamic>?;
    final bd = DrSystem.breakdown(handCards: hand, tableName: isMine ? '我的' : '队友', chariot: chariot);
    final dr = bd['total']!;
    final mainN = chariot?['main'] ?? 1;
    final subN = chariot?['sub'] ?? 0;
    final mainLv = chariot?['mainLv'] ?? 1;
    final c = isMine ? const Color(0xFF67D2F5) : const Color(0xFFC79BF0);
    return [
      Text('${hand.length}/10',
          style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: c)),
      const SizedBox(width: 4),
      GestureDetector(
        onTap: () => _showDrDetails(isMine, bd),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
          decoration: BoxDecoration(
            color: dr > 0 ? const Color(0x33FFD24A) : Colors.white.withAlpha(18),
            borderRadius: BorderRadius.circular(5),
          ),
          child: Text('🚂${AppData.chariotShort(mainN, subN)} 🛡${dr.toStringAsFixed(1)}%',
              style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold,
                  color: dr > 0 ? const Color(0xFFFFD24A) : Colors.white24)),
        ),
      ),
      const SizedBox(width: 4),
      GestureDetector(
        onTap: () => showPoolDialog(isMine),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
          decoration: BoxDecoration(color: const Color(0xFF2BB3A3), borderRadius: BorderRadius.circular(5)),
          child: const Text('🎴卡池', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
        ),
      ),
    ];
  }

  /// 🛡 减伤详情弹窗：拆分明细（洗炼/酋长/小野/宝库/战车）+ 战车配置 + 管理入口
  void _showDrDetails(bool isMine, Map<String, double> bd) {
    final drTable = isMine ? '我的' : '队友';
    final chariot = proj?[isMine ? 'myChariot' : 'teammateChariot'] as Map<String, dynamic>?;
    final mainN = chariot?['main'] ?? 1;
    final mainLv = chariot?['mainLv'] ?? 1;
    final subN = chariot?['sub'] ?? 0;
    showDialog(context: context, builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF1e293b),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(children: [
        Text(isMine ? '🛡 我方减伤' : '🛡 队友减伤', style: const TextStyle(color: Colors.white, fontSize: 15)),
        const Spacer(),
        GestureDetector(
          onTap: () {
            Navigator.pop(ctx);
            Navigator.push(context, MaterialPageRoute(builder: (_) => DrManagePage(initialTable: drTable)));
          },
          child: const Text('管理表 ›', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF2BB3A3))),
        ),
      ]),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('总减伤：${bd['total'].toString()}%',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF4ade80))),
        const SizedBox(height: 8),
        Text(DrSystem.tooltip(bd), style: const TextStyle(fontSize: 12, color: Colors.white70, height: 1.5)),
        const Divider(color: Colors.white12, height: 18),
        Text('🚂 ${isMine ? "我方" : "队友"}战车：${AppData.chariotShort(mainN, subN)}（主车 $mainN 号 Lv$mainLv · 副车 ${((subN ?? 0) as int) <= 0 ? "未设置" : "$subN 号"}）',
            style: const TextStyle(fontSize: 11.5, color: Colors.white54)),
        const Text('只有「走马江湖号」计减伤；主车 3×等级+6，副车再乘融合系数',
            style: TextStyle(fontSize: 10, color: Colors.white38)),
        const SizedBox(height: 4),
        Text('减伤表：$drTable（点击右上角「管理表」编辑洗炼/特殊技能）',
            style: const TextStyle(fontSize: 10.5, color: Colors.white38)),
      ]),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.pop(ctx);
            showChariotDialog(chariot, isMine);
          },
          child: const Text('战车详情', style: TextStyle(color: Color(0xFFFFD24A))),
        ),
        TextButton(onPressed: () => Navigator.pop(ctx),
            child: Text('关闭', style: TextStyle(color: Colors.white.withOpacity(0.6)))),
      ],
    ));
  }

  /// 🚂 战车设置（与网页同步：23 辆选车 + 等级 + 副车 + 副车融合系数；只有走马江湖号计减伤）
  void showChariotDialog(Map<String, dynamic>? c, bool isMine) {
    final sideKey = isMine ? 'myChariot' : 'teammateChariot';
    final st = Map<String, dynamic>.from(c ?? {});
    st['main'] = (st['main'] ?? 1) as int;
    st['mainLv'] = ((st['mainLv'] ?? 1) as int).clamp(1, 20);
    st['sub'] = (st['sub'] ?? 0) as int;
    st['subLv'] = ((st['subLv'] ?? 1) as int).clamp(1, 20);
    st['subFusion'] = (st['subFusion'] ?? 0) as int;

    void persist() {
      proj![sideKey] = st;
      persistProject();
    }

    late StateSetter setSheet;

    Widget carChips(String field) {
      return SizedBox(
        height: 150,
        child: GridView.builder(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, childAspectRatio: 2.6, mainAxisSpacing: 4, crossAxisSpacing: 4),
          itemCount: AppData.chariotList.length + (field == 'sub' ? 1 : 0),
          itemBuilder: (_, i) {
            final idx = field == 'sub' ? (i == 0 ? 0 : i) : i + 1;
            final selected = st[field] == idx;
            final isDr = AppData.chariotIsDr(idx);
            final name = idx == 0 ? '未设置' : AppData.chariotName(idx);
            return GestureDetector(
              onTap: () { st[field] = idx; persist(); setSheet(() {}); },
              child: Container(
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  color: selected ? const Color(0xFF2BB3A3) : Colors.white.withAlpha(25),
                  borderRadius: BorderRadius.circular(7),
                  border: isDr ? Border.all(color: const Color(0x884ade80), width: 0.8) : null,
                ),
                child: Text('$name${isDr ? " 🛡" : ""}',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold,
                        color: selected ? const Color(0xFF07231F) : (isDr ? const Color(0xFF9BE9E0) : Colors.white60))),
              ),
            );
          },
        ),
      );
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF16162C),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, ss) {
          setSheet = ss;
          final dr = AppData.chariotSideDr(st);
          return SafeArea(
            child: Container(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.88),
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
              child: SingleChildScrollView(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text('🚂 ${isMine ? "我方" : "队友"}战车设置', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: dr > 0 ? const Color(0x334ade80) : Colors.white.withAlpha(20),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('🛡 ${dr.toStringAsFixed(1)}%',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold,
                              color: dr > 0 ? const Color(0xFF4ade80) : Colors.white24)),
                    ),
                  ]),
                  const Text('只有「走马江湖号 🛡」计减伤：主车 3×等级+6，副车再乘融合系数',
                      style: TextStyle(fontSize: 10, color: Colors.white38)),
                  const SizedBox(height: 10),
                  // 主车
                  Text('主战车：${AppData.chariotName(st["main"])}（Lv${st["mainLv"]}）',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF4ECDC4))),
                  const SizedBox(height: 5),
                  carChips('main'),
                  SliderTheme(
                    data: SliderTheme.of(context).copyWith(activeTrackColor: const Color(0xFF4ECDC4), thumbColor: const Color(0xFF4ECDC4), inactiveTrackColor: Colors.white24),
                    child: Slider(
                      min: 1, max: 20, divisions: 19, value: (st['mainLv'] as int).toDouble(),
                      label: 'Lv ${st['mainLv']}',
                      onChanged: (v) { st['mainLv'] = v.round(); persist(); setSheet(() {}); },
                    ),
                  ),
                  const SizedBox(height: 4),
                  // 副车
                  Text('副战车：${(st["sub"] as int) <= 0 ? "未设置" : AppData.chariotName(st["sub"] as int) + "（Lv${st["subLv"]}）"}',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFF0932B))),
                  const SizedBox(height: 5),
                  carChips('sub'),
                  if ((st['sub'] as int) > 0) ...[
                    SliderTheme(
                      data: SliderTheme.of(context).copyWith(activeTrackColor: const Color(0xFFF0932B), thumbColor: const Color(0xFFF0932B), inactiveTrackColor: Colors.white24),
                      child: Slider(
                        min: 1, max: 20, divisions: 19, value: (st['subLv'] as int).toDouble(),
                        label: 'Lv ${st['subLv']}',
                        onChanged: (v) { st['subLv'] = v.round(); persist(); setSheet(() {}); },
                      ),
                    ),
                    const Text('副车融合系数（副车被融合后保留的减伤比例）',
                        style: TextStyle(fontSize: 10.5, color: Colors.white38)),
                    const SizedBox(height: 4),
                    Row(children: [
                      for (var f = 0; f < 4; f++)
                        Expanded(
                          child: GestureDetector(
                            onTap: () { st['subFusion'] = f; persist(); setSheet(() {}); },
                            child: Container(
                              margin: EdgeInsets.only(right: f < 3 ? 6 : 0),
                              padding: const EdgeInsets.symmetric(vertical: 7),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: st['subFusion'] == f ? const Color(0xFFF0932B) : Colors.white.withAlpha(25),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text('${[50, 60, 70, 80][f]}%',
                                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold,
                                      color: st['subFusion'] == f ? const Color(0xFF1A1A2E) : Colors.white60)),
                            ),
                          ),
                        ),
                    ]),
                  ],
                  const SizedBox(height: 10),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }

  // ------------------------------------------------------- 卡池
  void showPoolDialog(bool isMine) {
    setState(() {
      poolSideMine = isMine;
      poolOverlayOpen = true;
    });
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
        // 🔴 修复：handCards() 返回的是副本，必须删 proj 里的真实列表，否则移不出手牌
        onRemove: () {
          Navigator.pop(context);
          final key = isMine ? 'myHandCards' : 'teammateHandCards';
          final real = proj?[key] as List?;
          if (real != null && handIdx < real.length) real.removeAt(handIdx);
          refresh();
          persistProject();
        },
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
