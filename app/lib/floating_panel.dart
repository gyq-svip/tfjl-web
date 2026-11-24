import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:ui' show Rect;
import 'ui_alpha.dart';

/// 通用悬浮面板：可拖标题移动、拖右下角缩放，位置/大小记忆，不遮挡整个界面。
/// 对齐网页 openGenericPicker(floating:true) 的体验。
class FloatingPanel extends StatefulWidget {
  final String storageKey;      // SP key 前缀（位置/大小记忆）
  final String title;
  final Color accent;
  final Rect defaultRect;       // 相对屏幕比例 0~1
  final Widget child;
  final VoidCallback? onClose;

  const FloatingPanel({
    super.key,
    required this.storageKey,
    required this.title,
    required this.child,
    this.accent = const Color(0xFF2BB3A3),
    this.onClose,
    Rect? defaultRect,
  }) : defaultRect = defaultRect ?? const Rect.fromLTWH(0.06, 0.12, 0.62, 0.70);

  @override
  State<FloatingPanel> createState() => _FloatingPanelState();
}

class _FloatingPanelState extends State<FloatingPanel> {
  late Rect rect;

  @override
  void initState() {
    super.initState();
    rect = widget.defaultRect;
    _load();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    final s = p.getString(widget.storageKey);
    if (s != null && s.isNotEmpty) {
      try {
        final v = s.split(',').map(double.parse).toList();
        if (v.length == 4) setState(() => rect = Rect.fromLTWH(v[0], v[1], v[2], v[3]));
      } catch (_) {}
    }
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(widget.storageKey, '${rect.left},${rect.top},${rect.width},${rect.height}');
  }

  @override
  Widget build(BuildContext context) {
    final sw = MediaQuery.of(context).size.width;
    final sh = MediaQuery.of(context).size.height;
    return Positioned(
      left: rect.left * sw, top: rect.top * sh,
      width: rect.width * sw, height: rect.height * sh,
      child: Material(
        color: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: UiAlpha.bg(const Color(0xFF16162C)),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: widget.accent.withAlpha(150), width: 1.5),
            boxShadow: const [BoxShadow(color: Color(0xAA000000), blurRadius: 16, spreadRadius: 2)],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Stack(children: [
              // 内容（留标题栏）
              Positioned.fill(
                top: 34,
                child: widget.child,
              ),
              // 标题栏（拖动移动 + 关闭按钮）
              Positioned(
                left: 0, top: 0, right: 0, height: 34,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanUpdate: (d) {
                    setState(() => rect = Rect.fromLTWH(
                      (rect.left + d.delta.dx / sw).clamp(0.0, 1.0 - rect.width),
                      (rect.top + d.delta.dy / sh).clamp(0.0, 1.0 - rect.height),
                      rect.width, rect.height,
                    ));
                  },
                  onPanEnd: (_) => _save(),
                  child: Container(
                    color: widget.accent.withAlpha(45),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Row(children: [
                      Icon(Icons.drag_indicator, size: 16, color: widget.accent),
                      const SizedBox(width: 4),
                      Expanded(child: Text(widget.title,
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: widget.accent),
                          overflow: TextOverflow.ellipsis)),
                      GestureDetector(
                        onTap: () => widget.onClose?.call(),
                        child: const Icon(Icons.close, size: 18, color: Colors.white70),
                      ),
                    ]),
                  ),
                ),
              ),
              // 右下角缩放把手
              Positioned(
                right: 0, bottom: 0,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanUpdate: (d) {
                    setState(() => rect = Rect.fromLTWH(
                      rect.left, rect.top,
                      (rect.width + d.delta.dx / sw).clamp(0.32, 1.0 - rect.left),
                      (rect.height + d.delta.dy / sh).clamp(0.28, 1.0 - rect.top),
                    ));
                  },
                  onPanEnd: (_) => _save(),
                  child: Container(
                    width: 26, height: 26,
                    decoration: BoxDecoration(
                      color: widget.accent.withAlpha(90),
                      borderRadius: const BorderRadius.only(bottomRight: Radius.circular(12)),
                    ),
                    child: Icon(Icons.zoom_out_map, size: 16, color: widget.accent),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
