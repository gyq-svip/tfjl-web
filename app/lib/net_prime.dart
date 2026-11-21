import 'dart:io';
import 'package:flutter/foundation.dart';

/// iOS 网络预热（借鉴 MQTT 项目已验证有效的方案）
/// 原理：iOS 14+ 的「无线局域网与蜂窝数据」授权，只有在 App **真正发起一次网络请求**
/// 且 App 已进入 active 状态时才会落到 App 上。首次请求太早（runApp 之前/首帧之前）
/// 会被系统吞掉，之后所有请求都失败。皮肤能显示只是本地缓存，不代表网络通。
///
/// 做法：首帧渲染完 + 短暂延迟后，主动 GET 一次公网，把授权拉起来；失败也不阻塞。
/// 同时记录每个域名的探测结果，供「网络自检」页面显示。
class NetPrime {
  static final List<NetProbeResult> lastResults = [];
  static bool primed = false;

  static const targets = [
    ('Gitee 皮肤源', 'https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/raw/main/skins-index.json'),
    ('GitHub Pages', 'https://gyq-svip.github.io/tfjl-web/gist-enc.txt'),
    ('GitHub API', 'https://api.github.com/gists/a32a0628bd9275f3a4922cd12cf298c9'),
  ];

  /// App 启动后调用一次（首帧后）。只探公网，不阻塞 UI。
  static Future<void> prime() async {
    if (primed) return;
    primed = true;
    final r = await probeAll(quick: true);
    lastResults
      ..clear()
      ..addAll(r);
    debugPrint('[NetPrime] ${r.map((e) => "${e.label}:${e.ok ? "OK" : e.detail}").join(" | ")}');
  }

  /// 完整探测（网络自检页面用）
  static Future<List<NetProbeResult>> probeAll({bool quick = false}) async {
    final out = <NetProbeResult>[];
    for (final (label, url) in targets) {
      out.add(await _probe(label, url, quick ? 8 : 12));
    }
    lastResults
      ..clear()
      ..addAll(out);
    return out;
  }

  static Future<NetProbeResult> _probe(String label, String url, int timeoutSec) async {
    final sw = Stopwatch()..start();
    final timeout = Duration(seconds: timeoutSec);
    HttpClient? client;
    try {
      client = HttpClient()
        ..connectionTimeout = timeout
        ..idleTimeout = timeout;
      final req = await client.getUrl(Uri.parse(url)).timeout(timeout);
      final resp = await req.close().timeout(timeout);
      await resp.drain<void>().timeout(timeout);
      sw.stop();
      client.close(force: true);
      final code = resp.statusCode;
      return NetProbeResult(label, url, code >= 200 && code < 400,
          'HTTP $code · ${sw.elapsedMilliseconds}ms');
    } catch (e) {
      sw.stop();
      try { client?.close(force: true); } catch (_) {}
      return NetProbeResult(label, url, false, _friendlyError(e));
    }
  }

  static String _friendlyError(Object e) {
    final s = e.toString();
    if (s.contains('Connection refused') || s.contains('errno 61')) return '连接被拒';
    if (s.contains('Network is unreachable') || s.contains('errno 51')) return '网络不可达';
    if (s.contains('No route to host') || s.contains('errno 65')) return '无路由';
    if (s.contains('TimeoutException') || s.contains('timed out')) return '超时';
    if (s.contains('HandshakeException') || s.contains('Certificate')) return '证书错误';
    if (s.contains('SocketException')) return 'Socket 错误';
    return s.length > 40 ? s.substring(0, 40) : s;
  }
}

class NetProbeResult {
  final String label;
  final String url;
  final bool ok;
  final String detail;
  const NetProbeResult(this.label, this.url, this.ok, this.detail);
}
