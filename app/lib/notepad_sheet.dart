import 'package:flutter/material.dart';

/// 记事本内容（对齐网页：项目 notepad 字段，随项目走，自动保存）
class NotepadSheet extends StatefulWidget {
  final Map<String, dynamic> proj;
  final VoidCallback onChanged;   // 保存回调（persistProject）
  final bool readOnly;            // 共享项目：只读（防止误改云端阵容的笔记）
  const NotepadSheet({super.key, required this.proj, required this.onChanged, this.readOnly = false});

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
    if (widget.readOnly) return;
    widget.proj['notepad'] = _ctrl.text;
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      if (widget.readOnly)
        const Padding(
          padding: EdgeInsets.only(top: 6),
          child: Text('☁ 共享项目 · 记事本只读，点「复制到本地」后可编辑',
              style: TextStyle(fontSize: 10, color: Color(0xFFFFB300))),
        ),
      // 工具栏：字号 + 清空
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(children: [
          if (!widget.readOnly) ...[
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
          ] else ...[
            const Text('📝 随共享项目带过来的笔记', style: TextStyle(fontSize: 10, color: Colors.white38)),
          ],
          const Spacer(),
          if (!widget.readOnly)
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
            readOnly: widget.readOnly,
            maxLines: null,
            expands: true,
            textAlignVertical: TextAlignVertical.top,
            style: TextStyle(fontSize: fontSize, color: Colors.white, height: 1.5),
            decoration: InputDecoration(
              hintText: widget.readOnly ? '' : '在这里记录笔记…（自动保存，随项目走）',
              hintStyle: const TextStyle(color: Colors.white30),
              border: InputBorder.none,
            ),
            onChanged: (_) => _save(),
          ),
        ),
      ),
    ]);
  }
}
