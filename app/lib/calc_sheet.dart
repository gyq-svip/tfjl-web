import 'package:flutter/material.dart';
import 'activity_calc.dart';

/// 活动计算器面板（手机端只读：商品从管理后台读取，按规则算最优购买）
/// 商品支持多选、每个可选数量（买2个3个都行）
class CalcSheet extends StatefulWidget {
  final ActivityCalc calc;
  const CalcSheet({super.key, required this.calc});
  @override
  State<CalcSheet> createState() => _CalcSheetState();
}

class _CalcSheetState extends State<CalcSheet> {
  int tabIdx = 0;
  final _ownedCtrl = TextEditingController(text: '0');
  final _daysCtrl = TextEditingController(text: '21');
  bool buyZhanLing = false;
  Map<String, dynamic>? _result;
  // 选中道具 → 数量
  final Map<String, int> _selected = {};
  // 手动输入的目标材料（没选道具时用）
  final _manualTargetCtrl = TextEditingController();

  List<Map<String, dynamic>> get tabs => widget.calc.tabs;
  Map<String, dynamic> get cur => tabs[tabIdx.clamp(0, tabs.length - 1)];

  int get selectedTotal {
    var sum = 0;
    for (final e in _selected.entries) {
      final cost = _itemCost(e.key);
      sum += cost * e.value;
    }
    return sum;
  }

  int _itemCost(String name) {
    final items = (cur['items'] as List?) ?? [];
    for (final it in items) {
      if ((it as Map)['name']?.toString() == name) return int.tryParse(it['cost']?.toString() ?? '') ?? 0;
    }
    return 0;
  }

  void _calc() {
    final fromItems = selectedTotal;
    final manual = int.tryParse(_manualTargetCtrl.text) ?? 0;
    final target = fromItems > 0 ? fromItems : manual;
    final owned = int.tryParse(_ownedCtrl.text) ?? 0;
    final days = int.tryParse(_daysCtrl.text) ?? (cur['days'] as int? ?? 21);
    if (target <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请先选道具（可多选/改数量）或输入目标材料数')));
      return;
    }
    final need = ActivityCalc.calcNeed(target: target, owned: owned, days: days, daily: 32, buyZhanLing: buyZhanLing);
    final plan = ActivityCalc.optimalPurchase(need['need']!, days);
    setState(() => _result = {...need, ...plan, 'target': target});
  }

  void _switchTab(int i) {
    setState(() {
      tabIdx = i;
      _daysCtrl.text = '${tabs[i]['days'] ?? 21}';
      _selected.clear();
      _result = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = (cur['items'] as List?) ?? [];
    return Column(children: [
      // 活动 tab
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
          for (var i = 0; i < tabs.length; i++)
            GestureDetector(onTap: () => _switchTab(i),
              child: Container(margin: EdgeInsets.only(left: i > 0 ? 4 : 0),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: tabIdx == i ? const Color(0xFF4CAF50) : Colors.white.withAlpha(35),
                    borderRadius: BorderRadius.circular(6)),
                child: Text('${tabs[i]['icon'] ?? ''} ${tabs[i]['name'] ?? ''}',
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold,
                        color: tabIdx == i ? Colors.white : Colors.white60)))),
        ])),
      ),
      // 商品列表（多选：点一下选中+1，再点右侧 +/- 改数量）
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(children: [
          Text('🛒 商品（后台配置，点选可多选）：', style: TextStyle(fontSize: 10, color: Color(0xFFFFD24A))),
          const Spacer(),
          if (_selected.isNotEmpty)
            GestureDetector(onTap: () => setState(() { _selected.clear(); _result = null; }),
              child: const Text('清空选择', style: TextStyle(fontSize: 9.5, color: Color(0xFFFF8A80)))),
        ])),
      SizedBox(height: 130, child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        itemCount: items.length,
        itemBuilder: (_, i) {
          final it = items[i] as Map;
          final name = (it['name'] ?? '').toString();
          final cost = int.tryParse(it['cost']?.toString() ?? '') ?? 0;
          final qty = _selected[name] ?? 0;
          return Padding(padding: const EdgeInsets.symmetric(vertical: 2),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                color: qty > 0 ? const Color(0x224CAF50) : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: qty > 0 ? Border.all(color: const Color(0x664CAF50)) : null,
              ),
              child: Row(children: [
                GestureDetector(
                  onTap: () => setState(() {
                    if (qty > 0) _selected.remove(name); else _selected[name] = 1;
                    _result = null;
                  }),
                  child: Icon(qty > 0 ? Icons.check_circle : Icons.radio_button_unchecked,
                      size: 15, color: qty > 0 ? const Color(0xFF4CAF50) : Colors.white38),
                ),
                const SizedBox(width: 5),
                Expanded(child: GestureDetector(
                  onTap: () => setState(() { _selected[name] = qty > 0 ? qty : 1; _result = null; }),
                  child: Text(name, style: TextStyle(fontSize: 10.5, color: qty > 0 ? Colors.white : Colors.white70),
                      overflow: TextOverflow.ellipsis))),
                Text('$cost', style: const TextStyle(fontSize: 10, color: Color(0xFF4ECDC4))),
                if (qty > 0) ...[
                  const SizedBox(width: 4),
                  GestureDetector(onTap: () => setState(() {
                    if (qty <= 1) _selected.remove(name); else _selected[name] = qty - 1;
                    _result = null;
                  }), child: const Icon(Icons.remove_circle_outline, size: 17, color: Color(0xFFFF8A80))),
                  Container(width: 20, alignment: Alignment.center,
                    child: Text('$qty', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A)))),
                  GestureDetector(onTap: () => setState(() {
                    if (qty >= 99) return;
                    _selected[name] = qty + 1;
                    _result = null;
                  }), child: const Icon(Icons.add_circle_outline, size: 17, color: Color(0xFF7CFC9B))),
                ],
              ]),
            ),
          );
        },
      )),
      // 已选合计 + 手动输入 + 已有/天数
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Row(children: [
        Text('已选合计：$selectedTotal', style: const TextStyle(fontSize: 10.5, color: Color(0xFF4ECDC4), fontWeight: FontWeight.bold)),
        const Spacer(),
        SizedBox(width: 90, height: 32, child: TextField(controller: _manualTargetCtrl,
          keyboardType: TextInputType.number, style: const TextStyle(fontSize: 10.5, color: Colors.white),
          decoration: const InputDecoration(labelText: '或手动目标', labelStyle: TextStyle(fontSize: 8.5, color: Colors.white54),
            isDense: true, border: OutlineInputBorder()),
          onChanged: (_) => setState(() {}))),
      ])),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), child: Row(children: [
        Expanded(child: SizedBox(height: 32, child: TextField(controller: _ownedCtrl,
          keyboardType: TextInputType.number, style: const TextStyle(fontSize: 10.5, color: Colors.white),
          decoration: const InputDecoration(labelText: '已有材料', labelStyle: TextStyle(fontSize: 8.5, color: Colors.white54),
            isDense: true, border: OutlineInputBorder())))),
        const SizedBox(width: 4),
        Expanded(child: SizedBox(height: 32, child: TextField(controller: _daysCtrl,
          keyboardType: TextInputType.number, style: const TextStyle(fontSize: 10.5, color: Colors.white),
          decoration: const InputDecoration(labelText: '剩余天数', labelStyle: TextStyle(fontSize: 8.5, color: Colors.white54),
            isDense: true, border: OutlineInputBorder())))),
      ])),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), child: Row(children: [
        Row(children: [
          Checkbox(value: buyZhanLing, onChanged: (v) => setState(() => buyZhanLing = v ?? false), activeColor: const Color(0xFF4CAF50)),
          const Text('买战令(98元/200材料)', style: TextStyle(fontSize: 9.5, color: Colors.white70)),
        ]),
        const Spacer(),
        GestureDetector(onTap: _calc, child: Container(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(color: const Color(0xFF4CAF50), borderRadius: BorderRadius.circular(8)),
          child: const Text('🧮 计算', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)))),
      ])),
      // 结果
      Expanded(child: Container(
        margin: const EdgeInsets.fromLTRB(8, 0, 8, 8), padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: Colors.black.withAlpha(50), borderRadius: BorderRadius.circular(8)),
        child: _result == null
            ? const Center(child: Text('点选商品（可多选/改数量）后点「计算」', style: TextStyle(fontSize: 10, color: Colors.white38)))
            : SingleChildScrollView(child: _resultView()),
      )),
    ]);
  }

  Widget _resultView() {
    final r = _result!;
    final plan = (r['plan'] as Map?) ?? {};
    final cost = r['cost'] ?? 0;
    final need = r['need'] ?? 0;
    final totalMat = r['totalMat'] ?? 0;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('🎯 目标材料：${r['target']} · 还需：$need（免费 ${r['totalFree']}）',
          style: const TextStyle(fontSize: 11, color: Color(0xFF4ECDC4), fontWeight: FontWeight.bold)),
      const SizedBox(height: 6),
      Text('💰 最优购买（总 ¥$cost）：', style: const TextStyle(fontSize: 11, color: Color(0xFFFFD24A), fontWeight: FontWeight.bold)),
      const SizedBox(height: 4),
      for (final e in plan.entries)
        if ((e.value as int) > 0)
          Padding(padding: const EdgeInsets.symmetric(vertical: 2),
            child: Text('  · ${e.key} × ${e.value}', style: const TextStyle(fontSize: 11.5, color: Colors.white))),
      const SizedBox(height: 8),
      Text('共获得 $totalMat 材料（${totalMat >= need ? '目标已达成 ✓' : '未达标 ✗'}）',
          style: TextStyle(fontSize: 10.5, color: totalMat >= need ? Colors.greenAccent : Colors.orangeAccent)),
      if ((r['zhanLingCost'] ?? 0) > 0)
        Text('另：战令 ¥${r['zhanLingCost']}', style: const TextStyle(fontSize: 10, color: Colors.white54)),
    ]);
  }
}
