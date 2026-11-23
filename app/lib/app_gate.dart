import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'data_store.dart';

/// 门禁阶段
enum GateStage {
  passed,             // 已通过（老用户 / 已解锁）
  needNick,           // 新用户：只需填昵称（管理员关闭了邀请码开关）
  needNickAndInvite,  // 新用户：昵称 + 邀请码（管理员开启开关）
}

/// 🚪 APP 使用门禁
///
/// 规则（管理员在网页后台「邀请码管理」里开关）：
/// - `room_index.json` 的 `appInviteGate = true` → **新用户**必须输入有效邀请码才能用
/// - `appInviteGate = false`（默认）→ 装上即用，不限制邀请码
/// - 无论开关如何，**新用户都必须填昵称**（与网页账号一致，用于心跳/邀请码/共享记录）
/// - **老用户**（本地已有昵称）直接通过，不受开关影响
class AppGate {
  /// 昵称键：与网页 localStorage 同键，心跳/邀请码共用
  static const nickKey = 'TFJL_UserName';
  static const _unlockKey = 'app_gate_unlocked';

  /// 云端开关：room_index.json 的 appInviteGate
  /// 用「API 优先」通道（带 token，5000/h，秒回；raw 目录在部分网络下不通）
  /// 读不到（无网/字段缺失）→ 当关闭处理，绝不因网络问题把用户挡在外面
  static Future<bool> cloudGateOn() async {
    try {
      final txt = await GistClient.readFileApiFirst(GistClient.masterGist, 'room_index.json')
          .timeout(const Duration(seconds: 18));
      if (txt == null || txt.isEmpty) return false;
      final idx = jsonDecode(txt);
      if (idx is Map) return idx['appInviteGate'] == true;
    } catch (_) {}
    return false;
  }

  /// 判定当前处于哪个阶段
  static Future<GateStage> resolve() async {
    final prefs = await SharedPreferences.getInstance();
    final nick = (prefs.getString(nickKey) ?? '').trim();
    if (nick.isNotEmpty) {
      // 老用户：已注册昵称 → 直接放行（同时补记解锁标记，之后开关切换也不影响）
      await prefs.setBool(_unlockKey, true);
      return GateStage.passed;
    }
    // 本机已用邀请码解锁过（例如清过昵称但解锁标记还在）→ 只需补昵称
    if (prefs.getBool(_unlockKey) == true) return GateStage.needNick;
    // 全新用户：看云端开关
    return await cloudGateOn() ? GateStage.needNickAndInvite : GateStage.needNick;
  }

  static Future<bool> isUnlocked() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_unlockKey) == true;
  }

  static Future<void> markUnlocked() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_unlockKey, true);
  }

  static Future<String> savedNick() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getString(nickKey) ?? '').trim();
  }

  static Future<void> saveNick(String nick) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(nickKey, nick.trim());
  }

  /// 昵称校验：返回错误文案，null = 合法
  static String? validateNick(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return '昵称不能为空';
    if (s.length < 2) return '昵称至少 2 个字';
    if (s.length > 12) return '昵称最多 12 个字';
    if (RegExp(r'[\s<>\\/]').hasMatch(s)) return '昵称不能含空格或特殊符号';
    return null;
  }
}
