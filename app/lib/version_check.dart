import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:open_filex/open_filex.dart';
import 'models.dart';
import 'ui_alpha.dart';

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

  /// 版本清单：GitHub Pages 静态文件（与 PC updater.json / 皮肤 skins-index.json 同一套路）
  /// 🔴 不用 Gitee API（匿名限流 403）、不用 CDN —— 清单随主站 main 分支自动发布
  static const _versionUrl = 'https://gyq-svip.github.io/tfjl-web/app-version.json';

  /// 拉最新版本信息。失败抛异常（带原因），成功返回版本信息
  static Future<({String ver, String apkUrl, String ipaUrl, String body, String apk2})> _fetchLatest() async {
    final http.Response r;
    try {
      r = await http
          .get(Uri.parse(_versionUrl), headers: {'User-Agent': 'TFJL-App'})
          .timeout(const Duration(seconds: 12));
    } catch (e) {
      throw Exception('网络异常（$e）');
    }
    if (r.statusCode != 200) {
      throw Exception('版本清单 HTTP ${r.statusCode}');
    }
    final d = jsonDecode(r.body) as Map<String, dynamic>;
    final ver = d['version']?.toString() ?? '';
    if (ver.isEmpty) {
      throw Exception('版本清单内容为空');
    }
    return (
      ver: ver,
      apkUrl: d['apk']?.toString() ?? '',
      ipaUrl: d['ipa']?.toString() ?? '',
      body: d['body']?.toString() ?? '',
      apk2: d['apk2']?.toString() ?? '',
    );
  }

  /// 启动后静默检查一次；任何失败（无网/超时/仓库不可达）一律不打扰
  static Future<void> check(BuildContext context) async {
    try {
      final info = await _fetchLatest();
      if (_cmp(info.ver, AppData.appVersion) <= 0) return;
      if (!context.mounted) return;
      await _showUpdateDialog(context, info);
    } catch (_) {
      // 静默失败，不影响使用
    }
  }

  /// 设置页手动「检查更新」：无论结果如何都给出明确反馈
  static Future<void> manualCheck(BuildContext context) async {
    ({String ver, String apkUrl, String ipaUrl, String body, String apk2})? info;
    String? err;
    try {
      info = await _fetchLatest();
    } catch (e) {
      err = e.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
    }
    if (!context.mounted) return;
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('❌ 检查失败：$err'), duration: const Duration(seconds: 3)));
      return;
    }
    final c = _cmp(info!.ver, AppData.appVersion);
    if (c <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✅ 已是最新版本 v${AppData.appVersion}'), duration: const Duration(seconds: 2)));
      return;
    }
    await _showUpdateDialog(context, info);
  }

  static Future<void> _showUpdateDialog(BuildContext context, ({String ver, String apkUrl, String ipaUrl, String body, String apk2}) info) async {
    final isIOS = Platform.isIOS;
    await showDialog(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        backgroundColor: UiAlpha.bg(const Color(0xFF1e293b)),
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
              onPressed: () async {
                // 🔴 iOS 复制修复：等写入完成 + 读回校验；空链接给提示；失败弹可手动选择的兜底框
                if (info.ipaUrl.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('iOS 安装包还没上传，稍后再试（可先更新安卓看更新说明）'),
                      duration: Duration(seconds: 2)));
                  return;
                }
                try {
                  await Clipboard.setData(ClipboardData(text: info.ipaUrl));
                  final check = await Clipboard.getData('text/plain');
                  if (check?.text != info.ipaUrl) throw Exception('剪贴板写入校验失败');
                  if (!ctx.mounted) return;
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('✅ iOS 安装包链接已复制，去全能签「网址下载」粘贴即可'),
                      duration: Duration(seconds: 3)));
                } catch (_) {
                  if (!ctx.mounted) return;
                  showDialog(
                    context: ctx,
                    builder: (c2) => AlertDialog(
                      backgroundColor: UiAlpha.bg(const Color(0xFF1e293b)),
                      title: const Text('请手动长按复制', style: TextStyle(color: Colors.white, fontSize: 15)),
                      content: SelectableText(info.ipaUrl,
                          style: const TextStyle(color: Color(0xFF67D2F5), fontSize: 12)),
                      actions: [TextButton(onPressed: () => Navigator.pop(c2), child: const Text('关闭'))],
                    ),
                  );
                }
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
  static Future<void> _downloadAndInstall(BuildContext context, ({String ver, String apkUrl, String ipaUrl, String body, String apk2}) info) async {
    final pct = ValueNotifier<double?>(null);
    var cancelled = false;
    unawaited(showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          backgroundColor: UiAlpha.bg(const Color(0xFF1e293b)),
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
      // 🔴 加固：带浏览器 UA + 自动跟随重定向（Gitee 302→302→对象存储），多源自动切换，报错带原因
      final urls = [info.apkUrl, if (info.apk2.isNotEmpty) info.apk2];
      File? apk;
      Object? lastErr;
      for (final url in urls) {
        if (url.isEmpty) continue;
        try {
          final client = http.Client();
          final req = http.Request('GET', Uri.parse(url));
          req.headers['User-Agent'] =
              'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
          req.followRedirects = true;
          req.maxRedirects = 6;
          final resp = await client.send(req).timeout(const Duration(seconds: 30));
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
          client.close();
          if (received < 5 * 1024 * 1024) throw Exception('文件过小（$received 字节，可能被拦截）');
          apk = f;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (cancelled) return;
      if (apk == null) throw lastErr ?? Exception('下载失败');
      final open = await OpenFilex.open(apk.path, type: 'application/vnd.android.package-archive');
      if (open.type != ResultType.done && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('安装器打开失败：${open.message}，改用浏览器下载'),
            duration: const Duration(seconds: 3)));
        launchUrl(Uri.parse(info.apkUrl), mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      if (context.mounted && !cancelled) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('应用内下载失败（$e），改用浏览器下载'), duration: const Duration(seconds: 3)));
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
