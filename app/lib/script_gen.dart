import 'models.dart';

/// 阵容脚本生成引擎 —— 逐行照搬网页 app-features.js 的 buildScriptBase /
/// buildHiddenSwitchPart / toLaoMaScriptName（用户优化数百次的逻辑）。
class ScriptGen {
  static const jingLingNames = [
    '冰精灵', '光精灵', '魔精灵', '木精灵', '土精灵', '雷精灵', '暗精灵', '幻精灵', '魂精灵', '彩精灵'
  ];
  // 老马工程卡短名（脚本识别用）
  static const gongChengNames = ['火炮', '咬人娃娃', '潜艇', '宝库', '射线'];
  // 蛇女加速优先级（火灵>虎弓>风灵>冰鸟>后羿>天使>水灵）—— 活动脚本用（不含小野）
  static const sheNvPriority = ['火灵', '虎弓', '风灵', '冰鸟', '后羿', '天使', '水灵'];
  // 隐藏榜蛇女加速优先级（parseHiddenScript 2026-09-09：冰鸟插在风灵后、后羿前，小野参与）
  static const sheNvPriorityHidden = ['火灵', '虎弓', '风灵', '冰鸟', '后羿', '小野', '天使', '水灵'];

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
    if (isHidden) {
      // 🔴 隐藏榜专用重排（照搬网页 parseHiddenScript 2026-09-08 规则）：
      //   小野/凤凰是「到时间替换上去」的无敌链卡（只在关键时间点扛一次攻击），不是开局上阵卡。
      //   顺序 = ①其他卡（非精灵非小野非凤凰）→ ②小野 → ③凤凰 → ④精灵（精灵仍最后）。
      //   效果：其他卡够 6 张时小野/凤凰自然落不到上阵位（开局先不上）；不够时小野优先、凤凰其次补位。
      heroNames = [
        ...heroNames.where((n) => !_containsAny(n, jingLingNames) && !n.contains('小野') && !n.contains('凤凰')),
        ...heroNames.where((n) => n.contains('小野')),
        ...heroNames.where((n) => n.contains('凤凰')),
        ...heroNames.where((n) => _containsAny(n, jingLingNames)),
      ];
    }
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
    //   隐藏榜表含小野（parseHiddenScript）；活动表不含小野（buildScriptBase）
    final priorityList = isHidden ? sheNvPriorityHidden : sheNvPriority;
    final priorityCards = priorityList.where((p) => filteredCards.any((n) => n.contains(p)))
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
    if (isHidden) {
      // 🔴 照搬网页：小野/凤凰垫到上阵末尾（小野在凤凰前）。
      //   卡不足 6 张时它们补位上阵但要排最后，保证切卡行的「下{第一张卡}」永远是普通卡。
      arranged = [
        ...arranged.where((n) => !n.contains('小野') && !n.contains('凤凰')),
        ...arranged.where((n) => n.contains('小野')),
        ...arranged.where((n) => n.contains('凤凰')),
      ];
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

  /// 隐藏榜专属：无敌链切卡 —— 严格照搬网页 buildHiddenSwitchPart（app-features.js 7740）
  /// 4 种情况：
  ///  1 小野没上阵+凤凰没上阵+卡>6 → 小野 02:26/02:31 + 凤凰三段 02:44/02:49/02:50
  ///  2 只有凤凰没小野 → 凤凰三段 02:44/02:49/02:50
  ///  3 小野没上阵+凤凰已上阵 → 02:26下凤凰上小野 / 02:31下小野上凤凰 / 02:50下凤凰上小野
  ///  4 小野已上阵+凤凰没上阵 → 02:44下小野上凤凰3级 / 02:49上凤凰满 / 02:50下凤凰上小野
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

    // 情况1的小野上下：小野没上阵 + 凤凰没上阵(或未携带) + 卡>6
    final needXiao = xiaoNot && !fengDeployed && nonCount > 6;
    if (needXiao) {
      buf.writeln('02:26,下$first,上小野满$jlStr,');
      buf.writeln('02:31,下小野,上$first满$jlStr,');
    }

    // 情况3：小野没上阵 + 凤凰携带且已上阵 → 小野优先上扛02:30，02:50再换小野
    final needFengToXiao = xiaoNot && fengCarried && fengDeployed;
    if (needFengToXiao) {
      buf.writeln('02:26,下凤凰,上小野满$jlStr,');
      buf.writeln('02:31,下小野,上凤凰满$jlStr,');
      buf.writeln('02:50,下凤凰,上小野满$jlStr,');
    }

    // 凤凰三段（情况1/2/4）
    final onlyFeng = fengNot && !xiaoCarried;                       // 情况2
    final needFeng = fengNot && (needXiao || xiaoDeployed || onlyFeng);
    if (needFeng) {
      // 情况4用「小野」做切回卡，情况1/2用「第一张卡」
      final backCard = (xiaoDeployed && !needXiao) ? '小野' : first;
      buf.writeln('02:44,下$backCard,上凤凰3级,');
      buf.writeln('02:49,上凤凰满,');
      buf.writeln('02:50,下凤凰,上$backCard满$jlStr,');
    }
    return buf.toString();
  }

  /// 深海脚本 —— 严格照搬网页 parseDungeonScript（app-features.js 7947）
  /// 深海是「波数制 1~130 波」，与活动/隐藏榜的秒级时间轴完全不同。
  static String _generateDungeon(String input) {
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

    // 过滤融合卡
    heroNames = heroNames.where((n) => AppData.I.splitFusion(n) == null).toList();
    if (heroNames.isEmpty) return '🚫 输入的均为融合卡，已过滤。融合卡需拆分为单卡后重新输入。';
    final overLimit = heroNames.length > 10 ? heroNames.sublist(10) : <String>[];
    if (heroNames.length > 10) heroNames = heroNames.sublist(0, 10);

    final isJL = (String n) => _containsAny(n, jingLingNames);
    final isXY = (String n) => n.contains('小野');
    final isFH = (String n) => n.contains('凤凰');
    // 深海排序：其他卡 → 小野 → 凤凰 → 精灵（小野/凤凰是到时间替换卡，开局不上阵）
    heroNames = [
      ...heroNames.where((n) => !isJL(n) && !isXY(n) && !isFH(n)),
      ...heroNames.where(isXY),
      ...heroNames.where(isFH),
      ...heroNames.where(isJL),
    ];
    if (zhenZhanLine.isNotEmpty) zhenZhanLine = '上阵：${heroNames.join(',')}';

    final hasSheNv = heroNames.any((n) => n.contains('蛇女'));
    final hasHuoLing = heroNames.any((n) => n.contains('火灵'));
    final hasTianShi = heroNames.any((n) => n.contains('天使'));
    final hasFengLing = heroNames.any((n) => n.contains('风灵'));
    final hasHuGong = heroNames.any((n) => n.contains('虎弓'));
    final hasGuangJL = heroNames.any((n) => n.contains('光精灵'));
    final hasMoJL = heroNames.any((n) => n.contains('魔精灵'));
    final hasLeiJL = heroNames.any((n) => n.contains('雷精灵'));
    final hasMuJL = heroNames.any((n) => n.contains('木精灵'));
    final hasHunJL = heroNames.any((n) => n.contains('魂精灵'));
    final hasHuanJL = heroNames.any((n) => n.contains('幻精灵'));
    final hasSheXian = heroNames.any((n) => n.contains('射线'));
    final hasBaoKu = heroNames.any((n) => n.contains('宝库'));

    // 过滤精灵，得到非精灵卡
    final filteredCards = heroNames.where((n) => !isJL(n)).toList();
    // 工程卡（含射线/宝库）
    final gongChengCards = filteredCards.where((n) =>
        _containsAny(n, gongChengNames) || n.contains('射线') || n.contains('宝库')).toList();
    // 循环卡：火灵、虎弓、天使（19下49上，逢9上逢0下）
    final cycleNames = <String>[];
    if (hasHuoLing) cycleNames.add('火灵');
    if (hasHuGong) cycleNames.add('虎弓');
    if (hasTianShi) cycleNames.add('天使');
    final hasCycle = cycleNames.isNotEmpty;

    // 蛇女加速优先级（深海表：含小野，不含冰鸟后置）
    final priority = ['火灵', '虎弓', '风灵', '冰鸟', '后羿', '小野', '天使', '水灵'];
    final priorityCards = priority.where((p) => filteredCards.any((n) => n.contains(p)))
        .map((p) => filteredCards.firstWhere((n) => n.contains(p))).toList();

    List<String> arranged;
    if (hasSheNv) {
      final top2 = priorityCards.take(2).toList();
      final restP = priorityCards.skip(2).toList();
      final nonP = filteredCards.where((n) =>
          !priorityCards.contains(n) && !n.contains('蛇女') &&
          !_containsAny(n, gongChengNames) && !n.contains('射线') && !n.contains('宝库')).toList();
      arranged = [...restP, ...nonP].take(3).toList();
      arranged.addAll(top2);
      arranged.addAll(filteredCards.where((n) => n.contains('蛇女')));
      // 工程卡单独排，不参与强制顺序
      arranged = arranged.where((n) =>
          !_containsAny(n, gongChengNames) && !n.contains('射线') && !n.contains('宝库')).toList().take(6).toList();
    } else {
      // 无蛇女：非工程取前6（凤凰兜底靠后）
      final others = filteredCards.where((n) =>
          !_containsAny(n, gongChengNames) && !n.contains('射线') &&
          !n.contains('宝库') && !n.contains('蛇女')).toList();
      arranged = others.take(6).toList();
    }
    // 小野/凤凰统一移到末尾（无敌链替换卡）
    arranged = [
      ...arranged.where((n) => !n.contains('小野') && !n.contains('凤凰')),
      ...arranged.where((n) => n.contains('小野')),
      ...arranged.where((n) => n.contains('凤凰')),
    ];

    final buf = StringBuffer();
    if (zhenZhanLine.isNotEmpty) buf.writeln(zhenZhanLine);
    // 魔化/皮肤/主战车/副战车（深海：未填魔化则默认填非精灵）
    final moHuaAuto = heroNames.where((n) => !isJL(n)).toList();
    for (final defLine in ['魔化', '皮肤', '主战车', '副战车']) {
      final found = otherLines.where((l) => l.startsWith(defLine)).toList();
      if (found.isNotEmpty) buf.writeln(found.first);
      else if (defLine == '魔化' && moHuaAuto.isNotEmpty) {
        moHuaCards = List.from(moHuaAuto);
        buf.writeln('魔化：${moHuaAuto.join(',')}');
      } else buf.writeln('$defLine：');
    }
    buf.writeln();

    // 第 1 波
    final line1 = <String>[];
    if (hasSheNv) line1.add('强制顺序上卡');
    if (hasGuangJL) {
      if (gongChengCards.any((n) => n.contains('火炮'))) line1.add('光葫芦火炮');
      if (hasFengLing) line1.add('光葫芦风灵');
      for (final c in cycleNames) { line1.add('光葫芦$c'); }
    }
    // 工程卡先上（满），不参与强制顺序
    for (final n in gongChengCards) { line1.add('上${n}满'); }
    for (final n in arranged) {
      line1.add(hasSheNv ? '上$n' : '上${n}满');   // 有蛇女：非工程不满（强制顺序）
    }
    buf.writeln('1,${line1.join(',')},');

    // 第 11 波：有蛇女时全满
    if (hasSheNv) {
      final line2 = <String>[];
      for (final n in gongChengCards) { line2.add('上${n}满'); }
      for (final n in arranged) { line2.add('上${n}满'); }
      buf.writeln('11,${line2.join(',')},');
    }

    // 16 波换龙心（有幻精灵）
    if (hasHuanJL) buf.writeln('16,换龙心,');

    // 19 波下循环卡
    if (cycleNames.isNotEmpty) buf.writeln('19,${cycleNames.map((c) => '下$c').join(',')},');

    // 49~129 波，每 10 波循环（逢9上逢0下）
    final hasJingLingOps = hasLeiJL || hasMoJL || hasMuJL || hasHunJL;
    if (hasCycle || hasJingLingOps) {
      for (var wave = 49; wave <= 129; wave += 10) {
        final up = <String>[];
        if (hasCycle) {
          if (hasGuangJL) for (final c in cycleNames) { up.add('光葫芦$c'); }
          for (final c in cycleNames) { up.add('上${c}满'); }
        }
        // 精灵操作：逢9波（>=49）
        if (hasLeiJL) up.add('每4秒共100次雷精灵');
        if (hasMoJL) up.add('每4秒共100次魔精灵');
        if (hasMuJL) up.add('每4秒共100次木精灵');
        if (hasHunJL) up.add('每2秒共100次魂精灵');
        if (up.isNotEmpty) buf.writeln('$wave,${up.join(',')},');

        // 逢0停球 + 下循环卡
        if (wave < 129 && (hasJingLingOps || hasCycle)) {
          final stop = <String>['停球'];
          if (hasCycle) for (final c in cycleNames) { stop.add('下$c'); }
          buf.writeln('${wave + 1},${stop.join(',')},');
        }
      }
      // 130 波停球
      if (hasJingLingOps) buf.writeln('130,停球,');
    }

    var result = buf.toString();
    if (overLimit.isNotEmpty) result = '⚠️ 超出10张上限，已忽略：${overLimit.join('、')}\n$result';
    return toLaoMa(result);
  }

  // ==================================================================
  // 脚本解析（照搬网页 app-scriptsim.js parseScript / applyWaveUpToWave）
  // 用途：粘贴老马脚本 → 解析出头部的上阵10卡 + 波次动作 → 模拟到最后一波
  //      得到每张卡的最终站位，直接应用到我的/队友手牌。
  // ==================================================================

  /// 解析一段脚本文本。返回 null = 无法解析（没有 上阵： 头）
  static ParsedScript? parseScript(String text) {
    final lines = text.replaceAll('\r', '').split('\n');
    final header = <String>[];
    var headerDone = false;
    final waveLines = <String>[];
    for (final raw in lines) {
      final line = raw.trim();
      if (line.isEmpty) { if (!headerDone && header.isNotEmpty) headerDone = true; continue; }
      if (!headerDone) {
        if (RegExp(r'^\d+[，,]').hasMatch(line)) { headerDone = true; waveLines.add(line); continue; }
        header.add(line);
      } else {
        waveLines.add(line);
      }
    }
    List<String>? lineup;
    final skins = <String, String>{};
    final mohua = <String>[];
    var mainVehicle = '', subVehicle = '';
    for (final line in header) {
      if (RegExp(r'^上阵[：:]').hasMatch(line)) {
        lineup = _csv(line.replaceFirst(RegExp(r'^上阵[：:]'), ''));
      } else if (RegExp(r'^皮肤[：:]').hasMatch(line)) {
        for (final s in _csv(line.replaceFirst(RegExp(r'^皮肤[：:]'), ''))) {
          final m = RegExp(r'^(.+?)(\d+)$').firstMatch(s);
          if (m != null) skins[m.group(1)!] = m.group(2)!;
        }
      } else if (RegExp(r'^魔化[：:]').hasMatch(line)) {
        mohua.addAll(_csv(line.replaceFirst(RegExp(r'^魔化[：:]'), '')));
      } else if (RegExp(r'^主战车[：:]').hasMatch(line)) {
        mainVehicle = line.replaceFirst(RegExp(r'^主战车[：:]'), '').trim();
      } else if (RegExp(r'^副战车[：:]').hasMatch(line)) {
        subVehicle = line.replaceFirst(RegExp(r'^副战车[：:]'), '').trim();
      }
    }
    if (lineup == null || lineup.isEmpty) return null;

    // 波次动作模拟：base → 槽位（0=工程位，1-6=普通位）
    final slots = List<String?>.filled(7, null);   // 存 base（主卡身份名）
    // 波次按序处理：先删后上（对齐网页 applyWaveUpToWave）
    final waveNums = <int>[];
    final waveActions = <List<Map<String, String>>>[];
    for (final line in waveLines) {
      final wm = RegExp(r'^(\d+)[，,](.*)$').firstMatch(line);
      if (wm == null) continue;
      final wave = int.tryParse(wm.group(1)!) ?? 0;
      final actions = <Map<String, String>>[];
      for (final part in _csv(wm.group(2) ?? '')) {
        if (part == '强制顺序上卡') continue;
        if (part == '同排取消') continue;
        if (part == '停球') continue;
        final down = RegExp(r'^下(.+)$').firstMatch(part);
        if (down != null && !part.contains('上')) {
          actions.add({'type': 'remove', 'hero': _cleanHero(down.group(1)!)});
          continue;
        }
        final up = RegExp(r'^上(.+?)(满|1级|2级|)$').firstMatch(part);
        if (up != null) {
          actions.add({'type': 'place', 'hero': _cleanHero(up.group(1)!), 'level': up.group(2)!.isEmpty ? '满' : up.group(2)!});
          continue;
        }
      }
      waveNums.add(wave);
      waveActions.add(actions);
    }
    final order = List<int>.generate(waveNums.length, (i) => i);
    order.sort((a, b) => waveNums[a].compareTo(waveNums[b]));
    for (final wi in order) {
      final removals = <Map<String, String>>[];
      final others = <Map<String, String>>[];
      for (final a in waveActions[wi]) {
        (a['type'] == 'remove' ? removals : others).add(a);
      }
      for (final a in removals) {
        final base = _identity(a['hero']!);
        for (var i = 0; i <= 6; i++) {
          if (slots[i] != null && slots[i] == base) { slots[i] = null; break; }
        }
      }
      for (final a in others) {
        if (a['type'] != 'place') continue;
        final base = _identity(a['hero']!);
        // 已在槽上 → 原地替换（升级形态）
        var replaced = false;
        for (var i = 0; i <= 6; i++) {
          if (slots[i] == base) { slots[i] = base; replaced = true; break; }
        }
        if (replaced) continue;
        if (_isEng(a['hero']!)) {
          if (slots[0] == null) slots[0] = base;
        } else {
          for (var i = 1; i <= 6; i++) {
            if (slots[i] == null) { slots[i] = base; break; }
          }
        }
      }
    }
    // 每张卡的最终槽位 + 等级（最后一次上的等级）
    final levels = <String, String>{};   // base → '满'/'1级'/'2级'
    for (final wi in order) {
      for (final a in waveActions[wi]) {
        if (a['type'] == 'place') levels[_identity(a['hero']!)] = a['level'] ?? '满';
      }
    }
    final placed = <String, int>{};   // base → slot
    for (var i = 0; i <= 6; i++) {
      if (slots[i] != null) placed[slots[i]!] = i;
    }
    return ParsedScript(
      lineup: lineup.map(fromLaoMa).map(officialName).toList(),
      skins: skins, mohua: mohua,
      mainVehicle: mainVehicle, subVehicle: subVehicle,
      placedSlots: placed, levels: levels,
    );
  }

  static List<String> _csv(String s) =>
      s.split(RegExp(r'[,，]')).map((x) => x.trim()).where((x) => x.isNotEmpty).toList();

  static String _cleanHero(String s) =>
      s.replaceFirst(RegExp(r'^[上下]'), '').replaceFirst(RegExp(r'(满|1级|2级)$'), '').trim();

  /// 卡牌身份名（对齐网页 cardBase：工程变体取工程卡主身份）
  static String _identity(String name) {
    final official = officialName(fromLaoMa(name));
    for (final e in ['邪能火炮', '地精宝库', '侏儒射线', '微型潜艇', '咬人娃娃']) {
      if (official.contains(e) && !official.startsWith(e)) return e;
    }
    return official;
  }

  static bool _isEng(String name) {
    final official = officialName(fromLaoMa(name));
    for (final e in ['邪能火炮', '地精宝库', '侏儒射线', '微型潜艇', '咬人娃娃']) {
      if (official.contains(e)) return true;
    }
    return false;
  }

  static String officialName(String name) => AppData.officialName(name);
}

/// 解析结果：上阵10卡（官方名）+ 最终站位（base→槽位）+ 等级 + 皮肤/魔化/战车
class ParsedScript {
  final List<String> lineup;          // 上阵行，已转官方名
  final Map<String, String> skins;    // base短名 → 皮肤编号
  final List<String> mohua;           // 魔化名单（原样）
  final String mainVehicle, subVehicle;
  final Map<String, int> placedSlots; // base身份名 → 槽位0-6
  final Map<String, String> levels;   // base身份名 → '满'/'1级'/'2级'
  ParsedScript({required this.lineup, required this.skins, required this.mohua,
      required this.mainVehicle, required this.subVehicle,
      required this.placedSlots, required this.levels});
}
