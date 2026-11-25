import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 📊 手机端轻量上报：
/// - 关键操作埋点（只记操作名/计数/枚举，不记阵容内容、卡名、昵称）
/// - 异常/崩溃（错误类型 + 截断堆栈 + 页面）
/// - 会话时长、前后台次数、页面访问/停留
/// 不单独发网络请求，随 MobileHeartbeat 的 5 分钟心跳批量写入诊断 Gist；崩溃时由 main 立即 poke。
class Telemetry with WidgetsBindingObserver {
  static final Telemetry I = Telemetry._();
  Telemetry._();

  static const _pendingKey = 'tfjl_telemetry_pending_v1';
  static const _statsKey = 'tfjl_telemetry_stats_v1';
  static const _maxPending = 120;

  final List<Map<String, dynamic>> _pending = [];
  final Map<String, int> _actionCounts = {};
  final Map<String, int> _pageViews = {};
  final Map<String, int> _pageMs = {};

  String _sessionId = '';
  int _sessionStart = 0;
  int _resumeAt = 0;
  int _foregroundMs = 0;
  int _backgroundCount = 0;
  int _dropped = 0;
  String? _page;
  int _pageAt = 0;
  bool _active = true;
  bool _started = false;
  Timer? _saveTimer;
  int _lastErrorAt = 0;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    await _load();
    final now = DateTime.now().millisecondsSinceEpoch;
    _sessionId = 's$now';
    _sessionStart = now;
    _resumeAt = now;
    action('app_open');
    enterPage('home');
  }

  Future<void> _load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final t = p.getString(_pendingKey);
      if (t != null && t.isNotEmpty) {
        final j = jsonDecode(t);
        if (j is List) {
          for (final e in j) {
            if (e is Map) _pending.add(Map<String, dynamic>.from(e));
          }
        }
      }
      final s = p.getString(_statsKey);
      if (s != null && s.isNotEmpty) {
        final j = jsonDecode(s);
        if (j is Map) {
          _foregroundMs = (j['foregroundMs'] as num?)?.toInt() ?? 0;
          _backgroundCount = (j['backgroundCount'] as num?)?.toInt() ?? 0;
          _dropped = (j['dropped'] as num?)?.toInt() ?? 0;
          final a = j['actionCounts'];
          if (a is Map) a.forEach((k, v) { if (v is num) _actionCounts[k.toString()] = v.toInt(); });
          final pv = j['pageViews'];
          if (pv is Map) pv.forEach((k, v) { if (v is num) _pageViews[k.toString()] = v.toInt(); });
          final pm = j['pageMs'];
          if (pm is Map) pm.forEach((k, v) { if (v is num) _pageMs[k.toString()] = v.toInt(); });
        }
      }
    } catch (_) {}
  }

  void _scheduleSave() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(seconds: 2), _saveNow);
  }

  Future<void> _saveNow() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_pendingKey, jsonEncode(_pending));
      await p.setString(_statsKey, jsonEncode({
        'foregroundMs': _foregroundMs,
        'backgroundCount': _backgroundCount,
        'dropped': _dropped,
        'actionCounts': _actionCounts,
        'pageViews': _pageViews,
        'pageMs': _pageMs,
      }));
    } catch (_) {}
  }

  /// 关键操作：props 仅允许短标量，避免误传阵容内容
  void action(String name, [Map<String, dynamic>? props]) {
    if (!_started) return;
    _actionCounts[name] = (_actionCounts[name] ?? 0) + 1;
    final safe = <String, dynamic>{};
    props?.forEach((k, v) {
      if (v is String) safe[k] = v.length > 60 ? v.substring(0, 60) : v;
      else if (v is num || v is bool) safe[k] = v;
    });
    _pending.add({
      't': DateTime.now().millisecondsSinceEpoch,
      'a': name,
      if (safe.isNotEmpty) 'p': safe,
    });
    _trim();
    _scheduleSave();
  }

  void error(Object e, StackTrace? st, {String? page}) {
    if (!_started) return;
    // 同类错误 3 秒内只记一次，避免刷屏
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - _lastErrorAt < 3000) return;
    _lastErrorAt = now;
    var msg = e.toString();
    if (msg.length > 300) msg = msg.substring(0, 300);
    var stack = st?.toString() ?? '';
    if (stack.length > 3000) stack = stack.substring(0, 3000);
    _pending.add({
      't': now,
      'a': 'error',
      'e': msg,
      's': stack,
      if (page != null) 'page': page,
    });
    _trim();
    _saveNow();
  }

  void _trim() {
    while (_pending.length > _maxPending) {
      _pending.removeAt(0);
      _dropped++;
    }
  }

  void enterPage(String page) {
    if (!_started) return;
    _leavePage();
    _page = page;
    _pageAt = DateTime.now().millisecondsSinceEpoch;
    _pageViews[page] = (_pageViews[page] ?? 0) + 1;
    _scheduleSave();
  }

  void _leavePage() {
    if (_page == null) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    _pageMs[_page!] = (_pageMs[_page!] ?? 0) + (now - _pageAt);
    _page = null;
  }

  /// 心跳取快照；seq 用于写成功后只清掉这批，不误删期间新增事件
  Map<String, dynamic> snapshot() {
    final now = DateTime.now().millisecondsSinceEpoch;
    final fg = _foregroundMs + (_active ? (now - _resumeAt) : 0);
    final pageMs = Map<String, int>.from(_pageMs);
    if (_page != null) pageMs[_page!] = (pageMs[_page!] ?? 0) + (now - _pageAt);
    return {
      'seq': _pending.length,
      'events': List<Map<String, dynamic>>.from(_pending),
      'session': {
        'id': _sessionId,
        'start': _sessionStart,
        'foregroundMs': fg < 0 ? 0 : fg,
        'backgroundCount': _backgroundCount,
      },
      'actionCounts': Map<String, int>.from(_actionCounts),
      'pageViews': Map<String, int>.from(_pageViews),
      'pageMs': Map<String, int>.from(_pageMs),
      'dropped': _dropped,
    };
  }

  Future<void> confirmFlush(int seq) async {
    if (seq <= 0 || _pending.isEmpty) return;
    final n = seq > _pending.length ? _pending.length : seq;
    _pending.removeRange(0, n);
    await _saveNow();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive || state == AppLifecycleState.detached) {
      if (_active) {
        _active = false;
        _foregroundMs += now - _resumeAt;
        _backgroundCount++;
        action('app_background');
        _saveNow();
      }
    } else if (state == AppLifecycleState.resumed) {
      if (!_active) {
        _active = true;
        _resumeAt = now;
        action('app_resume');
      }
    }
  }

  @visibleForTesting
  int get pendingCount => _pending.length;
}
