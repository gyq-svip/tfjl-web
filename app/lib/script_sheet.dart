import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'script_gen.dart';

/// 脚本生成面板（活动/隐藏榜/深海）—— 照搬网页 gradScript 交互
class ScriptSheet extends StatefulWidget {
  const ScriptSheet({super.key});
  @override
  State<ScriptSheet> createState() => _ScriptSheetState();
}

class _ScriptSheetState extends State<ScriptSheet> {
  final _ctrl = TextEditingController();
  String _result = '';
  String _type = 'activity';

  void _gen() {
    setState(() => _result = ScriptGen.generate(_ctrl.text, _type));
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
