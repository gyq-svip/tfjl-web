import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'models.dart';
import 'script_gen.dart';
import 'telemetry.dart';

/// 脚本生成面板（活动/隐藏榜/深海）+ 老马脚本解析上卡
class ScriptSheet extends StatefulWidget {
  final Map<String, dynamic> proj;      // 解析上卡要写入的项目
  final VoidCallback onChanged;         // 应用后持久化
  final String? initialText;            // 系统分享/文件打开导入时预填脚本
  const ScriptSheet({super.key, required this.proj, required this.onChanged, this.initialText});
  @override
  State<ScriptSheet> createState() => _ScriptSheetState();
}

class _ScriptSheetState extends State<ScriptSheet> {
  final _ctrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.initialText != null && widget.initialText!.isNotEmpty) {
      _ctrl.text = widget.initialText!;
    }
  }

  String _result = '';
  String _type = 'activity';
  bool _applyMine = true;   // 解析上卡：true=我的 false=队友

  void _gen() {
    setState(() => _result = ScriptGen.generate(_ctrl.text, _type));
  }

  /// 🔍 解析老马脚本 → 直接应用到我的/队友手牌（含站位/等级/皮肤/魔化/战车）
  Future<void> _applyToLineup() async {
    final parsed = ScriptGen.parseScript(_ctrl.text);
    if (parsed == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('⚠️ 解析失败：脚本开头要有「上阵：卡1,卡2,…」'), duration: Duration(milliseconds: 1500)));
      return;
    }
    final isMine = _applyMine;
    final sideKey = isMine ? 'myHandCards' : 'teammateHandCards';
    final prefix = isMine ? 'u' : 't';
    final sideTag = isMine ? 'my' : 'teammate';

    // 工程位冲突检查
    final engCount = parsed.lineup.where((n) => _isEngName(n)).length;
    if (engCount > 1) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('⚠️ 脚本里有 $engCount 张工程卡，只能带 1 张'), duration: const Duration(milliseconds: 1500)));
      return;
    }

    final now = DateTime.now().millisecondsSinceEpoch;
    final hand = <Map<String, dynamic>>[];
    final levels = (widget.proj['cardLevels'] ?? {}) as Map<String, dynamic>;
    final lvStore = (levels[sideTag] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final skins = (widget.proj['cardSkins'] ?? {}) as Map<String, dynamic>;
    final mohuaMap = (widget.proj['cardMoHua'] ?? {}) as Map<String, dynamic>;

    for (final raw in parsed.lineup) {
      // 工程卡短名 → 官方名，短名别名 → 官方名（虎弓/蛇女等）
      var name = ScriptGen.fromLaoMa(raw);
      name = AppData.officialName(name);
      final fParts = AppData.I.splitFusion(name);
      final base = fParts != null ? fParts[0] : name;
      final pc = AppData.I.poolByName[base];
      final eng = _isEngName(name);
      final id = '${now + hand.length}';
      // 站位：优先用波次模拟出的最终站位
      final slotNo = parsed.placedSlots[ScriptGen.fromLaoMa(raw)] ?? parsed.placedSlots[name];
      String? placed;
      if (slotNo != null && slotNo <= 6) {
        placed = '$prefix$slotNo';
        // 槽位被别的卡占了就不放（10卡以内一般不会撞）
        if (hand.any((c) => c['placed'] == placed)) placed = null;
      }
      final card = <String, dynamic>{
        'id': id,
        'name': name,
        'placed': placed,
        'isEngineering': eng,
        'profession': eng ? 'engineering' : (pc?.prof ?? ''),
        'type': pc?.type ?? 'gold',
      };
      hand.add(card);
      // 等级：脚本波次里最后上卡的等级（满 → 按品质最高级；1级/2级 → 1/2）
      final key = '${sideTag}_$id';
      final lvTag = parsed.levels[ScriptGen.fromLaoMa(raw)] ?? parsed.levels[name] ?? '';
      lvStore[key] = _levelFromTag(lvTag, pc?.type ?? 'gold');
      // 皮肤：头部 皮肤：名字+编号（编号-1=皮肤序号，网页同款）；皮肤名直接存
      final skinTag = parsed.skins[ScriptGen.fromLaoMa(raw)] ?? parsed.skins[name] ?? parsed.skins[base] ?? '';
      if (skinTag.isNotEmpty) {
        final num = int.tryParse(skinTag);
        skins[key] = num == null ? skinTag : (num > 1 ? '${num - 1}' : '');
      }
      // 魔化
      final mSrc = ScriptGen.fromLaoMa(raw);
      final isMohua = parsed.mohua.any((m) => m == raw || m == mSrc || AppData.officialName(m) == name || AppData.officialName(m) == base);
      mohuaMap[key] = isMohua;
    }
    levels[sideTag] = lvStore;
    widget.proj['cardLevels'] = levels;
    widget.proj['cardSkins'] = skins;
    widget.proj['cardMoHua'] = mohuaMap;
    // 战车（脚本里有写就应用）
    if (parsed.mainVehicle.isNotEmpty) widget.proj[isMine ? 'vehicleMain' : 'mateVehicleMain'] = parsed.mainVehicle;
    if (parsed.subVehicle.isNotEmpty) widget.proj[isMine ? 'vehicleSub' : 'mateVehicleSub'] = parsed.subVehicle;
    widget.proj[sideKey] = hand;
    widget.onChanged();
    Telemetry.I.action('script_apply', {'side': isMine ? 'a' : 'b', 'count': hand.length});
    if (mounted) {
      final placedCnt = hand.where((c) => (c['placed'] ?? '').toString().isNotEmpty).length;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✅ 已解析 ${hand.length} 张卡到${isMine ? "我的" : "队友"}阵容（$placedCnt 张按脚本站位上阵）'),
          duration: const Duration(milliseconds: 1800)));
    }
  }

  static bool _isEngName(String name) {
    for (final e in const ['邪能火炮', '地精宝库', '侏儒射线', '微型潜艇', '咬人娃娃', '火炮', '宝库', '射线', '潜艇']) {
      if (name.contains(e)) return true;
    }
    return false;
  }

  static String _levelFromTag(String tag, String type) {
    if (tag == '1级') return '1';
    if (tag == '2级') return '2';
    // 满 → 该品质最高级（网页 getMaxLevel：blue 25 其余 24）
    return type == 'blue' ? '25' : '24';
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      // 类型切换
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(children: [
          for (final t in [
            ('activity', '📜 活动'), ('hidden', '🎭 隐藏榜'), ('dungeon', '🌊 深海')
          ])
            Expanded(child: GestureDetector(
              onTap: () => setState(() => _type = t.$1),
              child: Container(
                margin: EdgeInsets.only(left: t.$1 == 'activity' ? 0 : 4),
                padding: const EdgeInsets.symmetric(vertical: 7),
                decoration: BoxDecoration(
                  color: _type == t.$1 ? const Color(0xFFFFD24A) : Colors.white.withAlpha(35),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(t.$2, textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold,
                        color: _type == t.$1 ? const Color(0xFF1A1A2E) : Colors.white70)),
              ),
            )),
        ]),
      ),
      // 输入
      Expanded(flex: 3, child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: Colors.black.withAlpha(50), borderRadius: BorderRadius.circular(8)),
        child: TextField(controller: _ctrl, maxLines: null, expands: true,
          textAlignVertical: TextAlignVertical.top,
          style: const TextStyle(fontSize: 12, color: Colors.white, height: 1.4, fontFamily: 'monospace'),
          decoration: const InputDecoration(hintText: '粘贴阵容文本：\n上阵：火灵,虎弓,蛇女,水灵\n魔化：火灵\n（与网页脚本输入框同格式）',
            hintStyle: TextStyle(color: Colors.white30, fontSize: 11), border: InputBorder.none),
        ),
      )),
      Padding(padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          GestureDetector(onTap: _gen,
            child: Container(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 7),
              decoration: BoxDecoration(color: const Color(0xFFFF5722), borderRadius: BorderRadius.circular(8)),
              child: const Text('⚙️ 生成脚本', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
            )),
          const SizedBox(width: 10),
          if (_result.isNotEmpty)
            GestureDetector(onTap: () {
              Clipboard.setData(ClipboardData(text: _result));
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ 已复制脚本'), duration: Duration(milliseconds: 800)));
            }, child: Container(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
              decoration: BoxDecoration(color: const Color(0xFF4CAF50), borderRadius: BorderRadius.circular(8)),
              child: const Text('📋 复制', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
            )),
        ]),
      ),
      // 🔍 解析上卡：粘贴老马脚本 → 直接应用到我/队友阵容（工程卡短名自动转换）
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(children: [
          GestureDetector(
            onTap: () => setState(() => _applyMine = !_applyMine),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(color: _applyMine ? const Color(0xFF4ECDC4) : const Color(0xFFF0932B), borderRadius: BorderRadius.circular(8)),
              child: Text(_applyMine ? '🅰 应用到：我的' : '🅱 应用到：队友',
                  style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Color(0xFF0A1A1F))),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: GestureDetector(
              onTap: _applyToLineup,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 7), alignment: Alignment.center,
                decoration: BoxDecoration(color: const Color(0xFFAB47BC), borderRadius: BorderRadius.circular(8)),
                child: const Text('🔍 解析上卡（粘贴老马脚本直接上阵容）',
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Colors.white)),
              ),
            ),
          ),
        ]),
      ),
      // 输出
      Expanded(flex: 4, child: Container(
        margin: const EdgeInsets.fromLTRB(8, 0, 8, 8), padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: const Color(0x1180C4C4), borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0x554ECDC4))),
        child: SingleChildScrollView(child: SelectableText(
          _result.isEmpty ? '生成的脚本显示在这里（已适配老马短名）' : _result,
          style: TextStyle(fontSize: 11, color: _result.isEmpty ? Colors.white30 : Colors.white,
            height: 1.4, fontFamily: 'monospace'),
        )),
      )),
    ]);
  }
}
