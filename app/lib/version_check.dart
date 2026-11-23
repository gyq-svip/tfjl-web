import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:open_filex/open_filex.dart';
import 'models.dart';

/// APP 内版本检测 —— 安装包托管在 Gitee 发行版 tag「app-v1」（只保留最新一版）：
/// 拉取该 release 的附件名 tfjl-android-v*.apk / tfjl-ios-v*.ipa 解析最新版本号，
/// 与内置 appVersion 比较，有新版弹窗：
/// · 安卓：先试应用内下载 APK → 拉起系统安装器（自动更新）；失败退浏览器下载
/// · iOS：一键复制 IPA 直链（不显示网址），全能签网址下载导入安装
class VersionCheck {
  static const _releaseApi =
      'https://gitee.com/api/v5/repos/dragon-soars-across-the-world_0/tfjl-web/releases/tags/app-v1';
  static final _assetRe =
      RegExp(r'^tfjl-(android|ios)-v(\d+\.\d+\.\d+)\.(apk|ipa)$');

  /// 拉最新版本信息。返回 null = 检查失败/已是最新
  static Future<({String ver, String apkUrl, String ipaUrl, String body})?> _fetchLatest() async {
    final r = await http
        .get(Uri.parse(_releaseApi))
        .timeout(const Duration(seconds: 12));
    if (r.statusCode != 200) return null;
    final rel = jsonDecode(r.body) as Map<String, dynamic>;
    final assets = (rel['assets'] as List?) ?? const [];
    String? ver, apkUrl, ipaUrl;
    for (final a in assets) {
      if (a is! Map) continue;
      final m = _assetRe.firstMatch((a['name'] ?? '').toString());
      if (m == null) continue;
      final url = (a['browser_download_url'] ?? '').toString();
      if (m.group(1) == 'android') { ver = m.group(2); apkUrl = url; }
      if (m.group(1) == 'ios') ipaUrl = url;
    }
    if (ver == null) return null;
    return (ver: ver, apkUrl: apkUrl ?? '', ipaUrl: ipaUrl ?? '', body: (rel['body'] ?? '').toString().trim());
  }

  /// 启动后静默检查一次；任何失败（无网/超时/仓库不可达）一律不打扰
  static Future<void> check(BuildContext context) async {
    try {
      final info = await _fetchLatest();
      if (info == null) return;
      if (_cmp(info.ver, AppData.appVersion) <= 0) return;
      if (!context.mounted) return;
      await _showUpdateDialog(context, info);
    } catch (_) {
      // 静默失败，不影响使用
    }
  }

  /// 设置页手动「检查更新」：无论是否有新版都给结果反馈
  static Future<void> manualCheck(BuildContext context) async {
    try {
      final info = await _fetchLatest();
      if (!context.mounted) return;
      if (info == null) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('检查失败：网络不通或稍后再试'), duration: Duration(seconds: 2)));
        return;
      }
      final c = _cmp(info.ver, AppData.appVersion);
      if (c <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('✅ 已是最新版本 v${AppData.appVersion}'), duration: const Duration(seconds: 2)));
        return;
      }
      await _showUpdateDialog(context, info);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('检查失败：网络异常'), duration: Duration(seconds: 2)));
      }
    }
  }

  static Future<void> _showUpdateDialog(BuildContext context, ({String ver, String apkUrl, String ipaUrl, String body}) info) async {
    final isIOS = Platform.isIOS;
    await showDialog(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: const [
          Icon(Icons.system_update, color: Color(0xFF4ade80)),
          SizedBox(width: 8),
          Text('发现新版本', style: TextStyle(color: Colors.white)),
        ]),
        content: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('最新版本：v${info.ver}　当前版本：v${AppData.appVersion}',
                  style: const TextStyle(color: Colors.white, fontSize: 14)),
              if (info.body.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(info.body,
                    style: TextStyle(color: Colors.white.withOpacity(0.72), fontSize: 12.5, height: 1.5)),
              ],
              const SizedBox(height: 6),
              Text(isIOS
                      ? 'iPhone：点「复制 iOS 安装包链接」→ 全能签 → 网址下载 → 粘贴链接 → 下载导入签名安装。'
                      : '安卓：点「立即更新」应用内下载后自动弹出安装；也可以点「浏览器下载」。',
                  style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11.5)),
            ]),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('以后再说', style: TextStyle(color: Colors.white.withOpacity(0.6))),
          ),
          if (isIOS)
            TextButton(
              onPressed: () {
                if (info.ipaUrl.isEmpty) return;
                Clipboard.setData(ClipboardData(text: info.ipaUrl));
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('✅ iOS 安装包链接已复制，去全能签「网址下载」粘贴即可'),
                    duration: Duration(seconds: 3)));
              },
              child: const Text('复制 iOS 链接',
                  style: TextStyle(color: Color(0xFF67D2F5), fontWeight: FontWeight.bold)),
            )
          else ...[
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                launchUrl(Uri.parse(info.apkUrl), mode: LaunchMode.externalApplication);
              },
              child: Text('浏览器下载', style: TextStyle(color: Colors.white.withOpacity(0.6))),
            ),
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                _downloadAndInstall(context, info);
              },
              child: const Text('立即更新',
                  style: TextStyle(color: Color(0xFF4ade80), fontWeight: FontWeight.bold)),
            ),
          ],
        ],
      ),
    );
  }

  /// 安卓应用内下载 APK → 拉起系统安装器（含进度弹窗）；失败退浏览器
  static Future<void> _downloadAndInstall(BuildContext context, ({String ver, String apkUrl, String ipaUrl, String body}) info) async {
    final pct = ValueNotifier<double?>(null);
    var cancelled = false;
    unawaited(showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('正在下载更新', style: TextStyle(color: Colors.white, fontSize: 16)),
          content: ValueListenableBuilder<double?>(
            valueListenable: pct,
            builder: (_, v, __) => Column(mainAxisSize: MainAxisSize.min, children: [
              LinearProgressIndicator(value: v, backgroundColor: Colors.white10, color: const Color(0xFF2BB3A3)),
              const SizedBox(height: 10),
              Text(v == null ? '连接中…' : '${(v * 100).toStringAsFixed(0)}%',
                  style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ]),
          ),
          actions: [
            TextButton(
              onPressed: () { cancelled = true; Navigator.pop(ctx); },
              child: Text('取消', style: TextStyle(color: Colors.white.withOpacity(0.6))),
            ),
          ],
        ),
      ),
    ));
    try {
      final req = http.Request('GET', Uri.parse(info.apkUrl));
      final resp = await req.send().timeout(const Duration(seconds: 30));
      if (resp.statusCode != 200) throw Exception('HTTP ${resp.statusCode}');
      final total = resp.contentLength ?? 0;
      final f = File('${Directory.systemTemp.path}${Platform.pathSeparator}tfjl-android-v${info.ver}.apk');
      final sink = f.openSync(mode: FileMode.write);
      var received = 0;
      await for (final chunk in resp.stream) {
        sink.writeFromSync(chunk);
        received += chunk.length;
        if (total > 0) pct.value = received / total;
      }
      sink.flushSync();
      sink.closeSync();
      if (cancelled) return;   // 用户取消了下载（文件留缓存，下次覆盖）
      // 拉起系统安装器
      final open = await OpenFilex.open(f.path, type: 'application/vnd.android.package-archive');
      if (open.type != ResultType.done && context.mounted) {
        launchUrl(Uri.parse(info.apkUrl), mode: LaunchMode.externalApplication);
      }
    } catch (_) {
      if (context.mounted && !cancelled) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('应用内下载失败，改用浏览器下载'), duration: Duration(seconds: 2)));
        launchUrl(Uri.parse(info.apkUrl), mode: LaunchMode.externalApplication);
      }
    } finally {
      pct.value = null;
      if (Navigator.of(context, rootNavigator: true).canPop()) {
        Navigator.of(context, rootNavigator: true).pop();
      }
    }
  }

  /// 语义化版本比较（照搬网页 _cmpVer）：a>b→1，相等→0，a<b→-1
  static int _cmp(String a, String b) {
    try {
      final pa =
          a.replaceFirst(RegExp('^v'), '').split('.').map((n) => int.tryParse(n) ?? 0).toList();
      final pb =
          b.replaceFirst(RegExp('^v'), '').split('.').map((n) => int.tryParse(n) ?? 0).toList();
      for (var i = 0; i < (pa.length > pb.length ? pa.length : pb.length); i++) {
        final x = i < pa.length ? pa[i] : 0;
        final y = i < pb.length ? pb[i] : 0;
        if (x > y) return 1;
        if (x < y) return -1;
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }
}
