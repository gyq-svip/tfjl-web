import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'models.dart';

/// APP 内版本检测 —— 照搬 PC 升级方式：
/// 安装包托管在 Gitee 发行版 tag「app-v1」（塔防助手 APP 安装包，只保留最新一版），
/// 这里拉取该 release 的附件名 tfjl-android-v*.apk 解析出最新版本号，
/// 与内置 appVersion 比较，有新版则弹窗引导下载（browser_download_url 直链，浏览器直接装）。
class VersionCheck {
  static const _releaseApi =
      'https://gitee.com/api/v5/repos/dragon-soars-across-the-world_0/tfjl-web/releases/tags/app-v1';
  static final _assetRe =
      RegExp(r'^tfjl-(android|ios)-v(\d+\.\d+\.\d+)\.(apk|ipa)$');

  /// 启动后静默检查一次；任何失败（无网/超时/仓库不可达）一律不打扰
  static Future<void> check(BuildContext context) async {
    try {
      final r = await http
          .get(Uri.parse(_releaseApi))
          .timeout(const Duration(seconds: 12));
      if (r.statusCode != 200) return;
      final rel = jsonDecode(r.body) as Map<String, dynamic>;
      final assets = (rel['assets'] as List?) ?? const [];
      String? ver, apkUrl;
      for (final a in assets) {
        if (a is! Map) continue;
        final m =
            _assetRe.firstMatch((a['name'] ?? '').toString());
        if (m == null || m.group(1) != 'android') continue;
        ver = m.group(2);
        apkUrl = (a['browser_download_url'] ?? '').toString();
        break;
      }
      if (ver == null || apkUrl == null || apkUrl.isEmpty) return;
      final cur = AppData.appVersion;
      if (_cmp(ver, cur) <= 0) return;
      if (!context.mounted) return;
      final body = (rel['body'] ?? '').toString().trim();
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16)),
          title: Row(children: const [
            Icon(Icons.system_update, color: Color(0xFF4ade80)),
            SizedBox(width: 8),
            Text('发现新版本', style: TextStyle(color: Colors.white)),
          ]),
          content: Column(mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('最新版本：v$ver　当前版本：v$cur',
                    style: const TextStyle(
                        color: Colors.white, fontSize: 14)),
                if (body.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(body,
                      style: TextStyle(
                          color: Colors.white.withOpacity(0.72),
                          fontSize: 12.5, height: 1.5)),
                ],
                const SizedBox(height: 6),
                Text('点击「立即更新」将在浏览器打开安装包直链，下载完成后直接安装。',
                    style: TextStyle(
                        color: Colors.white.withOpacity(0.5),
                        fontSize: 11.5)),
              ]),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('以后再说',
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.6))),
            ),
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                launchUrl(Uri.parse(apkUrl!),
                    mode: LaunchMode.externalApplication);
              },
              child: const Text('立即更新',
                  style: TextStyle(
                      color: Color(0xFF4ade80),
                      fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      );
    } catch (_) {
      // 静默失败，不影响使用
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
