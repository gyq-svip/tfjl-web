import 'dart:async';
import 'dart:convert';
import 'dart:io';
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
  static const appVersion = '1.8.4';

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

  /// 门禁注册完昵称后立即补报一次（否则要等下一个 5 分钟心跳才带上昵称）
  void pokeNow() { _tick(); }

  Future<void> _tick() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      var anonId = prefs.getString(_deviceKey) ?? '';
      if (anonId.isEmpty) {
        anonId = 'm' + DateTime.now().microsecondsSinceEpoch.toString().substring(6);
        await prefs.setString(_deviceKey, anonId);
      }
      // 注册昵称（与网页 TFJL_UserName 同名同义）：老用户的旧键做兼容兜底
      final nick = prefs.getString('TFJL_UserName')?.isNotEmpty == true
          ? prefs.getString('TFJL_UserName')!
          : (prefs.getString(_nickKey) ?? '手机用户');
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
        // 🔴 2026-11-24 系统标识：后台区分「📱 安卓 / 🍎 苹果 / 🖥️ PC / 🌐 网页」
        'os': Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'other'),
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

  /// 🔴 管理员远程改名（对齐网页 applyServerNickOverride）：
  /// 读本机 diag-<anonId>.json，若管理员打了 nickManagedByAdmin 且服务器 nick ≠ 本机 → 覆盖本机注册昵称。
  /// 返回是否发生了覆盖（用于刷新界面）。
  Future<bool> applyAdminNickOverride() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final anonId = prefs.getString(_deviceKey) ?? '';
      if (anonId.isEmpty) return false;
      final txt = await GistClient.readFile(diagGistId, 'diag-$anonId.json');
      if (txt == null || txt.isEmpty) return false;
      final obj = jsonDecode(txt);
      if (obj is! Map || obj['nickManagedByAdmin'] != true) return false;
      final payload = obj['payload'];
      final serverNick = (payload is Map ? payload['nick'] : null) ?? obj['nick'] ?? '';
      if (serverNick.toString().isEmpty) return false;
      if (serverNick.toString() == (prefs.getString('TFJL_UserName') ?? '')) return false;
      await prefs.setString('TFJL_UserName', serverNick.toString());
      debugPrint('[昵称管理] 已应用管理员远程昵称: ${prefs.getString('TFJL_UserName')} → $serverNick');
      return true;
    } catch (e) {
      debugPrint('[昵称管理] 应用服务器昵称失败(降级): $e');
      return false;
    }
  }
}
