import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dr_system.dart';

/// 📥 系统分享 / 文件打开导入桥
/// Android：ACTION_SEND / ACTION_VIEW（微信保存文件后「用其他应用打开」）
/// iOS：URL Scheme tfjl:// + Document Type（保存到「文件」后打开）
class ShareImport {
  static const _ch = MethodChannel('com.tfjl.app/share');
  static const _ev = EventChannel('com.tfjl.app/share/events');
  static final ValueNotifier<Map<String, dynamic>?> incoming = ValueNotifier(null);

  static Future<void> init() async {
    _ev.receiveBroadcastStream().listen((e) {
      if (e is Map) incoming.value = Map<String, dynamic>.from(e);
    }, onError: (_) {});
    try {
      final p = await _ch.invokeMethod<Map<dynamic, dynamic>>('getPending');
      if (p != null && p.isNotEmpty) incoming.value = Map<String, dynamic>.from(p);
    } catch (_) {}
  }

  static Future<String> readUri(String uri) async {
    try {
      final s = await _ch.invokeMethod<String>('readUri', {'uri': uri});
      return s ?? '';
    } catch (_) {
      try {
        return Uri.parse(uri).path.isNotEmpty ? await _readLocal(uri) : '';
      } catch (_) {
        return '';
      }
    }
  }

  static Future<String> _readLocal(String uri) async {
    // file:// 由 Dart 侧兜底；content:// 必须有原生侧 readUri
    final u = Uri.parse(uri);
    if (u.scheme == 'file') return await File(u.toFilePath()).readAsString();
    return '';
  }

  static String detect(String text) {
    final t = text.trimLeft();
    if (t.startsWith('{') || t.startsWith('[') ||
        t.contains('tdjl_dr_tables_v2') ||
        (t.contains('=====') && t.contains('表：'))) return 'dr';
    if (t.contains('上阵：') || t.contains('上阵:')) return 'script';
    return 'script';   // 默认当脚本，用户可在确认页改选
  }
}

/// 收到外部内容后弹确认页：按内容嗅探推荐目标，也允许手动改
class ShareImportHandler extends StatefulWidget {
  final void Function(String text, String kind) onImport;
  const ShareImportHandler({super.key, required this.onImport});

  @override
  State<ShareImportHandler> createState() => _ShareImportHandlerState();
}

class _ShareImportHandlerState extends State<ShareImportHandler> {
  @override
  void initState() {
    super.initState();
    ShareImport.incoming.addListener(_check);
    _check();
  }

  @override
  void dispose() {
    ShareImport.incoming.removeListener(_check);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();

  void _check() {
    final p = ShareImport.incoming.value;
    if (p == null) return;
    ShareImport.incoming.value = null;
    _handle(p);
  }

  Future<void> _handle(Map<String, dynamic> p) async {
    String text = (p['content'] ?? '').toString();
    if (text.isEmpty && p['uri'] != null) text = await ShareImport.readUri(p['uri'].toString());
    if (text.trim().isEmpty || !mounted) return;
    var kind = ShareImport.detect(text);
    final preview = text.length > 320 ? '${text.substring(0, 320)}…' : text;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setDlg) => AlertDialog(
        title: const Text('📥 外部导入'),
        content: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('检测到：${kind == 'dr' ? '减伤表数据' : '脚本/文本'}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF7CFC9B))),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.white.withAlpha(18), borderRadius: BorderRadius.circular(8)),
            child: Text(preview, style: const TextStyle(fontSize: 10.5, color: Colors.white70)),
          ),
          const SizedBox(height: 10),
          Wrap(spacing: 6, children: [
            ChoiceChip(label: const Text('脚本解析'), selected: kind == 'script',
                onSelected: (_) => setDlg(() => kind = 'script')),
            ChoiceChip(label: const Text('减伤表导入'), selected: kind == 'dr',
                onSelected: (_) => setDlg(() => kind = 'dr')),
          ]),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () {
            Navigator.pop(ctx);
            widget.onImport(text, kind);
          }, child: const Text('导入')),
        ],
      )),
    );
  }
}
