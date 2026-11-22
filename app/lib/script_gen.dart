import 'models.dart';

/// 阵容脚本生成引擎 —— 逐行照搬网页 app-features.js 的 buildScriptBase /
/// buildHiddenSwitchPart / toLaoMaScriptName（用户优化数百次的逻辑）。
class ScriptGen {
  static const jingLingNames = [
    '冰精灵', '光精灵', '魔精灵', '木精灵', '土精灵', '雷精灵', '暗精灵', '幻精灵', '魂精灵', '彩精灵'
  ];
  // 老马工程卡短名（脚本识别用）
  static const gongChengNames = ['火炮', '咬人娃娃', '潜艇', '宝库', '射线'];
  // 蛇女加速优先级（火灵>虎弓>风灵>冰鸟>后羿>天使>水灵）
  static const sheNvPriority = ['火灵', '虎弓', '风灵', '冰鸟', '后羿', '天使', '水灵'];

  /// 官方4字工程卡 → 老马短名（生成脚本输出时用）
  static String toLaoMa(String s) {
    if (s.isEmpty) return s;
    return s.replaceAllMapped(RegExp(r'邪能火炮|地精宝库|侏儒射线|微型潜艇'), (m) => {
      '邪能火炮': '火炮', '地精宝库': '宝库', '侏儒射线': '射线', '微型潜艇': '潜艇'
    }[m.group(0)] ?? m.group(0)!);
  }

  /// 老马短名 → 官方名（脚本导入识别阵容时用，反向）
  static String fromLaoMa(String s) {
    if (s.isEmpty) return s;
    // 注意顺序：先匹配长串，工程卡转官方（火炮→邪能火炮），用精确边界避免误伤
    return s.replaceAllMapped(RegExp(r'火炮|宝库|射线|潜艇'), (m) => {
      '火炮': '邪能火炮', '宝库': '地精宝库', '射线': '侏儒射线', '潜艇': '微型潜艇'
    }[m.group(0)] ?? m.group(0)!);
  }

  static bool _containsAny(String name, List<String> list) =>
      list.any((x) => name.contains(x));

  /// 解析输入文本 → 生成脚本。type: activity / hidden / dungeon
  static String generate(String input, String type) {
    if (type == 'dungeon') return _generateDungeon(input);
    final isHidden = type == 'hidden';
    final lines = input.trim().split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
    if (lines.isEmpty) return '请输入文本！';

    List<String> heroNames = [];
    String zhenZhanLine = '';
    final otherLines = <String>[];
    List<String> moHuaCards = [];

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (RegExp(r'^上阵[：:]').hasMatch(line)) {
        zhenZhanLine = line;
        final m = RegExp(r'上阵[：:]\s*(.+)').firstMatch(line);
        if (m != null) heroNames = m.group(1)!.split(RegExp(r'[,，]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      } else if (RegExp(r'^魔化[：:]').hasMatch(line)) {
        otherLines.add(line);
        final m = RegExp(r'魔化[：:]\s*(.+)').firstMatch(line);
        if (m != null) moHuaCards = m.group(1)!.split(RegExp(r'[,，]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      } else if (RegExp(r'^(皮肤|主战车|副战车)[：:]').hasMatch(line)) {
        otherLines.add(line);
      } else if (i == 0 && !RegExp(r'^(魔化|皮肤|主战车|副战车)[：:]').hasMatch(line)) {
        heroNames = line.split(RegExp(r'[,，]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      }
    }
    if (heroNames.isNotEmpty && zhenZhanLine.isEmpty) zhenZhanLine = '上阵：${heroNames.join(',')}';
    if (heroNames.isEmpty) return '未找到英雄名称！';

    // 过滤融合卡（融合卡不能用于脚本，需拆单卡）
    heroNames = heroNames.where((n) => AppData.I.splitFusion(n) == null).toList();
    if (heroNames.isEmpty) return '🚫 输入的均为融合卡，已过滤。融合卡需拆分为单卡后重新输入。';

    // 超10张截断
    final overLimit = heroNames.length > 10 ? heroNames.sublist(10) : <String>[];
    if (heroNames.length > 10) heroNames = heroNames.sublist(0, 10);

    // 精灵卡排最后（非精灵/精灵各自保持原顺序）
    heroNames = [
      ...heroNames.where((n) => !_containsAny(n, jingLingNames)),
      ...heroNames.where((n) => _containsAny(n, jingLingNames)),
    ];
    if (zhenZhanLine.isNotEmpty) zhenZhanLine = '上阵：${heroNames.join(',')}';

    final hasGongCheng = heroNames.any((n) => _containsAny(n, gongChengNames));
    final gongChengCards = heroNames.where((n) => _containsAny(n, gongChengNames)).toList();
    final filteredCards = heroNames.where((n) =>
        !_containsAny(n, jingLingNames) && !_containsAny(n, gongChengNames)).toList();
    final first6 = filteredCards.take(6).toList();

    final hasMoJingLing = heroNames.any((n) => n.contains('魔精灵'));
    final hasLongWang = heroNames.any((n) => n.contains('龙王'));
    final hasGuangJingLing = heroNames.any((n) => n.contains('光精灵'));
    final hasMuJingLing = heroNames.any((n) => n.contains('木精灵'));
    final hasHunJingLing = heroNames.any((n) => n.contains('魂精灵'));
    final hasLeiJingLing = heroNames.any((n) => n.contains('雷精灵'));
    final hasHuanJingLing = heroNames.any((n) => n.contains('幻精灵'));
    final hasSheNv = heroNames.any((n) => n.contains('蛇女'));
    final hasFeiJi = heroNames.any((n) => n.contains('飞机'));
    final hasDaSheng = heroNames.any((n) => n.contains('大圣'));
    final hasTongPai = hasFeiJi && hasDaSheng;

    final output = StringBuffer();
    if (zhenZhanLine.isNotEmpty) output.writeln(zhenZhanLine);

    // 魔化行：没填则自动填「除精灵外的所有卡」
    final moHuaAuto = heroNames.where((n) => !_containsAny(n, jingLingNames)).toList();
    for (final defLine in ['魔化', '皮肤', '主战车', '副战车']) {
      final found = otherLines.where((l) => l.startsWith(defLine)).toList();
      if (found.isNotEmpty) {
        output.writeln(found.first);
      } else if (defLine == '魔化' && moHuaAuto.isNotEmpty) {
        moHuaCards = List.from(moHuaAuto);
        output.writeln('魔化：${moHuaAuto.join(',')}');
      } else {
        output.writeln('$defLine：');
      }
    }
    output.writeln();

    bool isMoHua(String name) => moHuaCards.any((mh) => name.contains(mh) || mh.contains(name));

    // 蛇女加速优先级：top2 放 4-5 位，蛇女固定第 6 位
    final priorityCards = sheNvPriority.where((p) => filteredCards.any((n) => n.contains(p)))
        .map((p) => filteredCards.firstWhere((n) => n.contains(p))).toList();
    final sheNvCards = filteredCards.where((n) => n.contains('蛇女')).toList();
    List<String> arranged;
    if (hasSheNv) {
      final top2 = priorityCards.take(2).toList();
      final restPriority = priorityCards.skip(2).toList();
      final nonPriority = filteredCards.where((n) =>
          !priorityCards.contains(n) && !n.contains('蛇女') && !_containsAny(n, gongChengNames)).toList();
      arranged = [...restPriority, ...nonPriority].take(3).toList();
      arranged.addAll(top2);
      arranged.addAll(sheNvCards);
    } else {
      arranged = List.from(first6);
    }

    final shangKa = StringBuffer();
    String levelOf(String name) {
      if (isHidden) return '满';
      if (hasGuangJingLing) return isMoHua(name) ? '4级' : '3级';
      return '满';
    }
    for (final name in arranged) { shangKa.write('上$name${levelOf(name)},'); }
    if (hasGongCheng) {
      for (final name in gongChengCards) { shangKa.write('上$name${levelOf(name)},'); }
    }

    final qiangZhi = hasSheNv ? '强制顺序上卡,' : '';
    final tongPaiStr = hasTongPai ? '飞机大圣同排,' : '';
    var guangHuLu = '';
    if (isHidden && hasGuangJingLing) {
      final cards = hasGongCheng ? [...arranged, ...gongChengCards] : arranged;
      guangHuLu = cards.map((n) => '光葫芦$n,').join();
    }
    output.writeln('00:01,$qiangZhi$guangHuLu$tongPaiStr$shangKa');

    if (hasGuangJingLing) {
      final count = [1, 20 - moHuaCards.length].reduce((a, b) => a > b ? a : b);
      output.writeln('00:55,每0.1秒共${count}次光精灵,关闭验光');
    }
    if (hasLongWang && !hasMoJingLing) output.writeln('01:20,下龙王,上龙王不满,');
    if (hasTongPai) {
      if (hasGuangJingLing) output.writeln('01:20,下大圣,上大圣4级,光葫芦大圣,关闭验光,');
      else output.writeln('01:20,下大圣,上大圣满,');
    }
    final jl = <String>[];
    if (hasLeiJingLing) jl.add('每0.1秒共5000次雷精灵');
    if (hasMoJingLing) jl.add('每5秒共5000次魔精灵');
    if (hasMuJingLing) jl.add('每3秒共5000次木精灵');
    if (hasHunJingLing) jl.add('每3秒共5000次魂精灵');
    if (jl.isNotEmpty) output.writeln('01:25,${jl.join(',')},');
    if (hasLongWang && hasHuanJingLing) {
      output.writeln(jl.isNotEmpty ? '01:40,换强袭,${jl.join(',')},' : '01:40,换强袭,');
    }

    var result = output.toString();
    if (isHidden) result += _hiddenSwitchPart(
        arranged: arranged, heroNames: heroNames, gongChengCards: gongChengCards,
        hasLei: hasLeiJingLing, hasMo: hasMoJingLing, hasMu: hasMuJingLing, hasHun: hasHunJingLing);
    if (overLimit.isNotEmpty) result = '⚠️ 超出10张上限，已忽略：${overLimit.join('、')}\n$result';
    // 老马短名转换（生成脚本适配老马）
    return toLaoMa(result);
  }

  /// 隐藏榜专属：无敌链切卡（小野8秒 → 凤凰6秒）
  static String _hiddenSwitchPart({
    required List<String> arranged, required List<String> heroNames,
    required List<String> gongChengCards,
    required bool hasLei, required bool hasMo, required bool hasMu, required bool hasHun,
  }) {
    final buf = StringBuffer();
    final first = arranged.isNotEmpty ? arranged.first : '第一张卡';
    final fengCarried = heroNames.any((n) => n.contains('凤凰'));
    final xiaoCarried = heroNames.any((n) => n.contains('小野'));
    final fengDeployed = arranged.any((n) => n.contains('凤凰'));
    final xiaoDeployed = arranged.any((n) => n.contains('小野'));
    final nonCount = heroNames.where((n) =>
        !_containsAny(n, gongChengNames) && !_containsAny(n, jingLingNames)).length;
    final xiaoNot = xiaoCarried && !xiaoDeployed;
    final fengNot = fengCarried && !fengDeployed;
    final jl = <String>[];
    if (hasLei) jl.add('每0.1秒共5000次雷精灵');
    if (hasMo) jl.add('每5秒共5000次魔精灵');
    if (hasMu) jl.add('每3秒共5000次木精灵');
    if (hasHun) jl.add('每3秒共5000次魂精灵');
    final jlStr = jl.isNotEmpty ? ',${jl.join(',')}' : '';

    if (xiaoNot && !fengDeployed && nonCount > 6) {
      buf.writeln('02:26,下$first,上小野满$jlStr,');
      buf.writeln('02:31,下小野,上$first满$jlStr,');
    }
    if (xiaoNot && fengDeployed) buf.writeln('02:36,下凤凰,上小野满$jlStr,');
    if (xiaoDeployed && fengNot) buf.writeln('02:38,下小野,上凤凰满$jlStr,');
    if (!xiaoCarried && fengNot) {
      buf.writeln('02:26,上凤凰满$jlStr,');
      buf.writeln('02:31,下凤凰,上$first满$jlStr,');
    }
    return buf.toString();
  }

  /// 深海脚本（按网页 parseDungeonScript：一势力一图，简化版）
  static String _generateDungeon(String input) {
    // 深海规则与活动共用大部分时间轴，区别是「一势力一图」分组提示
    final base = generate(input, 'activity');
    return '$base\n🌊 深海副本：请按势力分图，一势力一图上阵。';
  }
}
