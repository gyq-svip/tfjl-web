import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData, FilteringTextInputFormatter;
import 'app_gate.dart';
import 'data_store.dart';
import 'ui_alpha.dart';

/// 🚪 首次使用门禁页（替换主页显示，不可跳过）
///   step 0：注册昵称（必填，与网页账号一致）
///   step 1：输入邀请码（仅当管理员开启「APP 需邀请码」时）
class GatePage extends StatefulWidget {
  final bool needInvite;
  final VoidCallback onPassed;
  const GatePage({super.key, required this.needInvite, required this.onPassed});

  @override
  State<GatePage> createState() => _GatePageState();
}

class _GatePageState extends State<GatePage> {
  /// 与网页邀请门保持一致：兜底加这个微信索取邀请码
  static const _wechatId = 'gyqsvip';

  final _nickCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  int _step = 0;
  bool _busy = false;
  String? _err;
  String _nick = '';
  bool _showContact = false;
  bool _qrLoading = false;
  Map<String, dynamic>? _qrCfg;

  @override
  void dispose() {
    _nickCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitNick() async {
    final err = AppGate.validateNick(_nickCtrl.text);
    if (err != null) {
      setState(() => _err = err);
      return;
    }
    setState(() { _busy = true; _err = null; });
    _nick = _nickCtrl.text.trim();
    await AppGate.saveNick(_nick);
    if (!mounted) return;
    if (widget.needInvite) {
      setState(() { _step = 1; _busy = false; });
    } else {
      await AppGate.markUnlocked();
      widget.onPassed();
    }
  }

  Future<void> _submitCode() async {
    final code = _codeCtrl.text.trim();
    if (code.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').length != 6) {
      setState(() => _err = '邀请码为 6 位字母数字');
      return;
    }
    setState(() { _busy = true; _err = null; });
    final r = await InviteClient.redeem(code: code, nick: _nick);
    if (!mounted) return;
    if (r.ok) {
      await AppGate.markUnlocked();
      widget.onPassed();
    } else {
      setState(() { _busy = false; _err = r.msg; });
    }
  }

  /// 默认收起；点「我没有邀请码」才加载/展示（复用网页管理员设置的群二维码）
  void _toggleContact() {
    final open = !_showContact;
    setState(() => _showContact = open);
    if (open && _qrCfg == null) _loadQrCfg();
  }

  Future<void> _loadQrCfg() async {
    setState(() => _qrLoading = true);
    Map<String, dynamic>? cfg;
    try {
      final idxTxt = await GistClient.readFileApiFirst(GistClient.masterGist, 'room_index.json')
          .timeout(const Duration(seconds: 15));
      if (idxTxt != null && idxTxt.isNotEmpty) {
        final idx = jsonDecode(idxTxt);
        final gid = (idx is Map ? idx['fabQrGistId'] : null)?.toString() ?? '';
        if (gid.isNotEmpty) {
          final txt = await GistClient.readFileApiFirst(gid, 'fabqrcode.json')
              .timeout(const Duration(seconds: 15));
          if (txt != null && txt.isNotEmpty) {
            final j = jsonDecode(txt);
            if (j is Map) cfg = Map<String, dynamic>.from(j);
          }
        }
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() { _qrCfg = cfg; _qrLoading = false; });
  }

  Widget _qrImage(String src) {
    try {
      if (src.startsWith('data:image')) {
        final bytes = base64Decode(src.substring(src.indexOf(',') + 1));
        return Image.memory(bytes, width: 140, height: 140, fit: BoxFit.contain,
            filterQuality: FilterQuality.medium, errorBuilder: (_, __, ___) => const SizedBox.shrink());
      }
      return Image.network(src, width: 140, height: 140, fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => const SizedBox.shrink());
    } catch (_) {
      return const SizedBox.shrink();
    }
  }

  Widget _contactPanel() {
    final cfg = _qrCfg;
    final qr = (cfg?['fabQrcode'] ?? '').toString();
    final tip = (cfg?['fabQrcodeTip'] ?? '扫码进群').toString();
    final ts = (cfg?['fabQrcodeTs'] as num?)?.toInt() ?? 0;
    final days = ts > 0 ? DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(ts)).inDays : 0;
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: UiAlpha.bg(const Color(0xFF0C0C17), 1.4),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0x332BB3A3)),
      ),
      child: Column(children: [
        if (_qrLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 18),
            child: Text('二维码加载中…', style: TextStyle(fontSize: 11, color: Color(0xFF8A96AC))),
          ),
        if (!_qrLoading && qr.isNotEmpty) ...[
          _qrImage(qr),
          const SizedBox(height: 4),
          Text(tip, style: const TextStyle(fontSize: 10.5, color: Color(0xFF4FC3F7))),
          if (days >= 7)
            const Padding(
              padding: EdgeInsets.only(top: 5),
              child: Text('⚠️ 二维码可能已失效，可加微信索取',
                  style: TextStyle(fontSize: 10, color: Color(0xFFFFB84D))),
            ),
          const SizedBox(height: 6),
        ],
        const Text('没有邀请码？加微信索取', style: TextStyle(fontSize: 11, color: Color(0xFF8A96AC))),
        const SizedBox(height: 4),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text(_wechatId, style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold,
              color: Color(0xFFFFD24A), letterSpacing: 0.6)),
          const SizedBox(width: 6),
          InkWell(
            onTap: () async {
              await Clipboard.setData(const ClipboardData(text: _wechatId));
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('微信号已复制'), duration: Duration(seconds: 1)));
              }
            },
            child: const Icon(Icons.copy, size: 15, color: Color(0xFF2BB3A3)),
          ),
        ]),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final totalStep = widget.needInvite ? 2 : 1;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
            child: Column(children: [
              const Text('🛡', style: TextStyle(fontSize: 44)),
              const SizedBox(height: 6),
              const Text('塔防助手', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
              const SizedBox(height: 4),
              Text('第 ${_step + 1} / $totalStep 步',
                  style: const TextStyle(fontSize: 11.5, color: Color(0xFF6C7A92))),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: UiAlpha.bg(const Color(0xFF15152A), 1.5),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0x33FDFDFF)),
                ),
                child: _step == 0 ? _nickStep() : _inviteStep(),
              ),
              const SizedBox(height: 14),
              const Text('昵称与网页账号一致 · 用于共享阵容、心跳、邀请码记录',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 10, color: Color(0xFF4A5568))),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _nickStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('👤 注册昵称', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF2BB3A3))),
      const SizedBox(height: 6),
      const Text('首次使用需要设置昵称，设置后不能自行修改（改名联系管理员）',
          style: TextStyle(fontSize: 10.5, color: Color(0xFF8A96AC), height: 1.5)),
      const SizedBox(height: 12),
      TextField(
        controller: _nickCtrl,
        autofocus: true,
        maxLength: 12,
        textInputAction: TextInputAction.done,
        style: const TextStyle(fontSize: 15, color: Colors.white),
        decoration: InputDecoration(
          hintText: '给自己起个昵称',
          hintStyle: const TextStyle(color: Color(0xFF4A5568), fontSize: 13),
          counterStyle: const TextStyle(fontSize: 9, color: Color(0xFF4A5568)),
          filled: true,
          fillColor: const Color(0xFF0C0C17),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        ),
        onSubmitted: (_) => _busy ? null : _submitNick(),
      ),
      if (_err != null) ...[
        const SizedBox(height: 6),
        Text(_err!, style: const TextStyle(fontSize: 11, color: Color(0xFFFF8A80))),
      ],
      const SizedBox(height: 12),
      SizedBox(
        height: 44,
        child: FilledButton(
          onPressed: _busy ? null : _submitNick,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF2BB3A3),
            disabledBackgroundColor: const Color(0xFF1E3A38),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF07231F)))
              : Text(widget.needInvite ? '下一步' : '进入',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF07231F))),
        ),
      ),
    ]);
  }

  Widget _inviteStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('🎟️ 输入邀请码', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
      const SizedBox(height: 6),
      const Text('本 App 目前仅限受邀用户使用，请向群友或管理员索要 6 位邀请码（一次性）',
          style: TextStyle(fontSize: 10.5, color: Color(0xFF8A96AC), height: 1.5)),
      const SizedBox(height: 4),
      Text('昵称：$_nick', style: const TextStyle(fontSize: 10.5, color: Color(0xFF2BB3A3))),
      const SizedBox(height: 12),
      TextField(
        controller: _codeCtrl,
        autofocus: true,
        maxLength: 8,
        textCapitalization: TextCapitalization.characters,
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]'))],
        textAlign: TextAlign.center,
        textInputAction: TextInputAction.done,
        style: const TextStyle(fontSize: 22, color: Colors.white, fontWeight: FontWeight.bold, letterSpacing: 6),
        decoration: InputDecoration(
          hintText: '------',
          hintStyle: const TextStyle(color: Color(0xFF2A3446), fontSize: 22, letterSpacing: 6),
          counterText: '',
          filled: true,
          fillColor: const Color(0xFF0C0C17),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
        ),
        onSubmitted: (_) => _busy ? null : _submitCode(),
      ),
      if (_err != null) ...[
        const SizedBox(height: 8),
        Text(_err!, style: const TextStyle(fontSize: 11, color: Color(0xFFFF8A80))),
      ],
      const SizedBox(height: 12),
      SizedBox(
        height: 44,
        child: FilledButton(
          onPressed: _busy ? null : _submitCode,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFFFFD24A),
            disabledBackgroundColor: const Color(0xFF3A3520),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF1A1A2E)))
              : const Text('进入 App', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF1A1A2E))),
        ),
      ),
      Center(
        child: TextButton(
          onPressed: _toggleContact,
          child: Text(_showContact ? '收起获取方式' : '我没有邀请码？',
              style: const TextStyle(fontSize: 11.5, color: Color(0xFF4FC3F7))),
        ),
      ),
      if (_showContact) _contactPanel(),
    ]);
  }
}
