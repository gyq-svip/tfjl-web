import 'package:flutter/material.dart';
import 'net_prime.dart';

/// 网络自检面板：一键测试三个关键域名，定位 iOS 上共享打不开的原因
class NetCheckSheet extends StatefulWidget {
  const NetCheckSheet({super.key});
  @override
  State<NetCheckSheet> createState() => _NetCheckSheetState();
}

class _NetCheckSheetState extends State<NetCheckSheet> {
  List<NetProbeResult> results = List.from(NetPrime.lastResults);
  bool testing = false;

  Future<void> _run() async {
    setState(() {
      testing = true;
      results = [];
    });
    final r = await NetPrime.probeAll();
    if (!mounted) return;
    setState(() {
      testing = false;
      results = r;
    });
  }

  @override
  Widget build(BuildContext context) {
    final allOk = results.isNotEmpty && results.every((e) => e.ok);
    final cacheOk = results.isNotEmpty && results[0].ok;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Row(children: [
            Text('🌐 网络自检', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFFFFD24A))),
          ]),
          const SizedBox(height: 6),
          const Text('共享阵容依赖联网。若这里不通，皮肤能显示也只是本地缓存，不代表网络正常。',
              style: TextStyle(fontSize: 11, color: Colors.white60, height: 1.5)),
          const SizedBox(height: 12),
          if (testing)
            const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator(color: Color(0xFF2BB3A3))))
          else
            ...results.map((r) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: r.ok ? const Color(0xFF1A3320) : const Color(0xFF3A1E1E),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: r.ok ? const Color(0xFF3F8F45) : const Color(0xFF8F3F3F)),
              ),
              child: Row(children: [
                Text(r.ok ? '✅' : '❌', style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(r.label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
                  const SizedBox(height: 2),
                  Text(r.detail, style: TextStyle(fontSize: 10, color: r.ok ? const Color(0xFF8FD89A) : const Color(0xFFE89A9A))),
                ])),
              ]),
            )),
          if (results.isNotEmpty && !testing) ...[
            const SizedBox(height: 4),
            Text(_conclusion(allOk, cacheOk), style: const TextStyle(fontSize: 11, color: Color(0xFFCFD6E6), height: 1.6)),
          ],
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: testing ? null : _run,
            icon: const Icon(Icons.refresh, size: 16),
            label: Text(testing ? '检测中…' : (results.isEmpty ? '开始检测' : '重新检测')),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2BB3A3), foregroundColor: const Color(0xFF07231F)),
          ),
        ]),
      ),
    );
  }

  String _conclusion(bool allOk, bool cacheOk) {
    if (allOk) return '✅ 三个域名都通，网络正常。共享打不开请检查项目栏是否选了「共享」。';
    final giteeOk = results.isNotEmpty && results[0].ok;
    final pagesOk = results.length > 1 && results[1].ok;
    final anyOk = results.any((e) => e.ok);
    if (!anyOk) return '❌ 三个域名都不通 —— 手机确实没给这个 App 联网权限。\n去 设置 → 蜂窝网络（或无线局域网）→ 找到本 App，开关数据一次；再杀掉后台重开。';
    if (pagesOk) return '✅ GitHub Pages 通（共享 token 走这里），网络本身没问题。\n若共享仍打不开，退出重进一次即可。';
    if (giteeOk) return '⚠️ 只有 Gitee 通，GitHub 线路不通 —— 国内网络对 GitHub 不稳定。\n可切换 WiFi/蜂窝，或开飞行模式再关掉重测。';
    return '⚠️ 部分域名不通，可切换 WiFi/蜂窝后重测。';
  }
}
