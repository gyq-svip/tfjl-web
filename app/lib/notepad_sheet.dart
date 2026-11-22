import 'package:flutter/material.dart';

/// 记事本内容（对齐网页：项目 notepad 字段，随项目走，自动保存）
class NotepadSheet extends StatefulWidget {
  final Map<String, dynamic> proj;
  final VoidCallback onChanged;   // 保存回调（persistProject）
  const NotepadSheet({super.key, required this.proj, required this.onChanged});

  @override
  State<NotepadSheet> createState() => _NotepadSheetState();
}

class _NotepadSheetState extends State<NotepadSheet> {
  late TextEditingController _ctrl;
  double fontSize = 15;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.proj['notepad']?.toString() ?? '');
  }

  @override
  void dispose() {
    _save();
    _ctrl.dispose();
    super.dispose();
  }

  void _save() {
    widget.proj['notepad'] = _ctrl.text;
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      // 工具栏：字号 + 清空
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(children: [
          const Text('字号', style: TextStyle(fontSize: 10, color: Colors.white54)),
          const SizedBox(width: 4),
          for (final fs in [12.0, 15.0, 18.0, 22.0])
            GestureDetector(
              onTap: () => setState(() => fontSize = fs),
              child: Container(
                margin: const EdgeInsets.only(right: 4),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: fontSize == fs ? const Color(0xFFFFD24A) : Colors.white.withAlpha(35),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(fs == 12 ? '小' : fs == 15 ? '中' : fs == 18 ? '大' : '特大',
                    style: TextStyle(fontSize: 9, color: fontSize == fs ? const Color(0xFF1A1A2E) : Colors.white70)),
              ),
            ),
          const Spacer(),
          GestureDetector(
            onTap: () {
              _ctrl.clear();
              _save();
              setState(() {});
            },
            child: const Text('清空', style: TextStyle(fontSize: 10, color: Color(0xFFFF8A80))),
          ),
        ]),
      ),
      // 编辑区
      Expanded(
        child: Container(
          margin: const EdgeInsets.fromLTRB(8, 0, 8, 8),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.black.withAlpha(60),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF7986CB).withAlpha(90)),
          ),
          child: TextField(
            controller: _ctrl,
            maxLines: null,
            expands: true,
            textAlignVertical: TextAlignVertical.top,
            style: TextStyle(fontSize: fontSize, color: Colors.white, height: 1.5),
            decoration: const InputDecoration(
              hintText: '在这里记录笔记…（自动保存，随项目走）',
              hintStyle: TextStyle(color: Colors.white30),
              border: InputBorder.none,
            ),
            onChanged: (_) => _save(),
          ),
        ),
      ),
    ]);
  }
}
