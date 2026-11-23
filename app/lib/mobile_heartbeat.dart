import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'data_store.dart';

/// 手机在线心跳 —— 上报到诊断 Gist（与桌面托盘同款），platform='mobile'。
/// 网页诊断面板会显示 📱 手机在线（昵称·版本·平台）。
class MobileHeartbeat {
  // 诊断 Gist（与网页 app-core.js 的 DIAG_GIST_ID 一致）
  static const diagGistId = 'deb09eba308f044c3b78935507972717';
  static const _deviceKey = 'mobile_device_anonid';
  static const _nickKey = 'mobile_heartbeat_nick';
  static const _lastKey = 'mobile_heartbeat_last';
  static const appVersion = '1.6.3';

  Timer? _timer;
  static final MobileHeartbeat I = MobileHeartbeat._();
  MobileHeartbeat._();

  /// APP 启动后调用：立即上报一次 + 每 5 分钟心跳（面板在线阈值通常 30~60 分钟）
  void start() {
    _tick();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 5), (_) => _tick());
  }

  void stop() { _timer?.cancel(); _timer = null; }

  Future<void> _tick() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      var anonId = prefs.getString(_deviceKey) ?? '';
      if (anonId.isEmpty) {
        anonId = 'm' + DateTime.now().microsecondsSinceEpoch.toString().substring(6);
        await prefs.setString(_deviceKey, anonId);
      }
      final nick = prefs.getString(_nickKey) ?? prefs.getString('TFJL_UserName') ?? '手机用户';
      final now = DateTime.now().millisecondsSinceEpoch;
      // 与网页 payload 同构，platform='mobile' 是关键标识
      final payload = {
        'anonId': anonId,
        'deviceId': anonId,
        'nick': nick,
        'lastUpload': now,
        'heartbeat': true,
        'writeOk': true,
        'appVersion': appVersion,
        'appExeVersion': appVersion,
        'platform': 'mobile',
        'day': DateTime.now().toString().substring(0, 10),
        'dayUploads': 1,
        'entries': [],
        'reportCount': 1,
      };
      final ok = await GistClient.writeFile(diagGistId, 'diag-$anonId.json', jsonEncode(payload));
      if (ok) await prefs.setInt(_lastKey, now);
      debugPrint('[心跳] 手机在线上报 ${ok ? '成功' : '失败'} ($anonId)');
    } catch (e) {
      debugPrint('[心跳] 异常: $e');
    }
  }

  /// 用户设昵称后可更新，下次心跳生效
  Future<void> setNick(String nick) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_nickKey, nick);
  }
}
