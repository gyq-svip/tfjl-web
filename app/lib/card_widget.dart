import 'dart:io';
import 'package:flutter/material.dart';
import 'models.dart';
import 'data_store.dart';

/// 一张卡的展示数据
class CardData {
  String name = '';
  String level = '1';
  String subLevel = '';
  bool subMohua = false;
  String cardType = '';   // gold/purple/blue/green
  String subCardType = '';  // 副卡品质（融合卡等级盾用）
  String prof = '';
  bool filled = false;
  bool hasMohua = false;
  bool isEngineering = false;
  String skinName = '';   // 当前皮肤
  List<String> fusion = [];  // [主, 副] 非空 = 融合卡

  File? mainFile;
  File? subFile;
  String mainKey = '';   // 主图缓存刷新 key（路径+mtime）
  String subKey = '';

  bool get isEmpty => name.isEmpty;
}

/// 卡槽组件：品质底 + 皮肤图 + 左下等级盾 + 融合副卡(左上金框+副卡等级/魔化) + 右下魔化 + 底部名字
class CardSlot extends StatelessWidget {
  final CardData data;
  final double size;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool dimmed;

  const CardSlot({
    super.key,
    required this.data,
    required this.size,
    this.onTap,
    this.onLongPress,
    this.dimmed = false,
  });

  @override
  Widget build(BuildContext context) {
    final d = data;
    final w = size;
    final bg = d.filled ? Color(AppData.qualityColor(d.cardType)) : const Color(0xFF191927);
    Widget content = Container(
      width: w,
      height: w,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(w * 0.07),
        border: Border.all(
          color: d.filled ? Color(AppData.qualityColor(d.cardType)).withAlpha(220) : Colors.white.withAlpha(35),
          width: 1.4,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(w * 0.07),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (d.mainFile != null)
              Image.file(d.mainFile!, key: ValueKey(d.mainKey + d.mainFile!.path), fit: BoxFit.cover, gaplessPlayback: true)
            else if (d.filled)
              ColoredBox(color: Color(AppData.qualityColor(d.cardType)).withAlpha(160)),
            // 融合副卡：左上 40% 金框 + 副卡等级/魔化
            if (d.subFile != null) ...[
              Positioned(
                left: 2, top: 2,
                child: SizedBox(
                  width: w * 0.40,
                  height: w * 0.40,
                  child: Stack(
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(3),
                          border: Border.all(color: const Color(0xFFFFD700), width: 2),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: Image.file(d.subFile!, key: ValueKey(d.subKey + d.subFile!.path), fit: BoxFit.cover, width: double.infinity, height: double.infinity, gaplessPlayback: true),
                        ),
                      ),
                      if (d.subLevel.isNotEmpty)
                        Positioned(
                          left: 0, bottom: 0,
                          child: SizedBox(
                            width: w * 0.20,
                            height: w * 0.20,
                            child: Stack(
                              children: [
                                Image.asset(
                                  'assets/images/shield-${_badgeType(d.subCardType.isNotEmpty ? d.subCardType : d.cardType)}.png',
                                  fit: BoxFit.fill,
                                  errorBuilder: (_, __, ___) => ColoredBox(color: Color(AppData.qualityColor(d.subCardType.isNotEmpty ? d.subCardType : d.cardType))),
                                ),
                                Center(
                                  child: Text(
                                    d.subLevel,
                                    style: TextStyle(
                                      color: const Color(0xFF1A1A2E),
                                      fontSize: w * 0.115,
                                      fontWeight: FontWeight.bold,
                                      shadows: const [Shadow(color: Colors.white54, blurRadius: 1)],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      if (d.subMohua)
                        Positioned(
                          right: 0, bottom: 0,
                          child: Image.asset('assets/images/mohua-icon.png', width: w * 0.21, height: w * 0.21),
                        ),
                    ],
                  ),
                ),
              ),
            ],
            // 名字条
            if (d.name.isNotEmpty)
              Positioned(
                left: 0, right: 0, bottom: 0,
                child: Container(
                  padding: EdgeInsets.only(
                    left: d.level.isNotEmpty ? w * 0.30 : 3,
                    right: d.hasMohua ? w * 0.30 : 3,
                    bottom: 2,
                  ),
                  child: Text(
                    d.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: d.isEngineering ? w * 0.085 : w * 0.095,
                      fontWeight: FontWeight.bold,
                      shadows: const [Shadow(color: Colors.black, blurRadius: 3, offset: Offset(0, 1))],
                    ),
                  ),
                ),
              ),
            // 等级盾（左下）—— 只有真正有卡的格子才画（空卡槽不该显示"1"）
            if (d.filled && d.level.isNotEmpty)
              Positioned(
                left: 0, bottom: 0,
                child: SizedBox(
                  width: w * 0.26,
                  height: w * 0.26,
                  child: Stack(
                    children: [
                      Image.asset(
                        'assets/images/shield-${_badgeType(d.cardType)}.png',
                        fit: BoxFit.fill,
                        errorBuilder: (_, __, ___) => ColoredBox(color: Color(AppData.qualityColor(d.cardType))),
                      ),
                      Center(
                        child: Text(
                          d.level,
                          style: TextStyle(
                            color: (d.cardType == 'gold' || d.cardType == 'engineering') ? const Color(0xFF1A1A2E) : Colors.white,
                            fontSize: w * 0.13,
                            fontWeight: FontWeight.bold,
                            shadows: const [Shadow(color: Colors.black54, blurRadius: 2)],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            // 魔化（右下）
            if (d.hasMohua)
              Positioned(
                right: 0, bottom: 0,
                child: Image.asset('assets/images/mohua-icon.png', width: w * 0.28, height: w * 0.28),
              ),
            // 已上阵变灰
            if (dimmed && d.filled) ColoredBox(color: const Color(0x99191B2E)),
          ],
        ),
      ),
    );

    if (onTap != null || onLongPress != null) {
      content = GestureDetector(
        onTap: onTap,
        onLongPress: onLongPress,
        child: content,
      );
    }
    return content;
  }

  static String _badgeType(String t) => t;
}

/// 手牌 JSON → CardData（应用项目内的等级/皮肤/魔化/融合副卡）
CardData parseCard(dynamic cardRaw, bool isMine, Map<String, dynamic> proj, {SkinPack? pack}) {
  final d = CardData();
  if (cardRaw is! Map<String, dynamic>) return d;
  d.name = cardRaw['name']?.toString() ?? '';
  d.prof = cardRaw['profession']?.toString() ?? '';
  d.isEngineering = cardRaw['isEngineering'] == true;

  final official = AppData.officialName(d.name);
  // 融合卡的品质按【主卡】判定（融合名不在卡池里，直接猜 type 会错）
  final fusionParts = AppData.I.splitFusion(d.name);
  final typeName = (fusionParts != null && fusionParts.isNotEmpty) ? fusionParts[0] : official;
  final pc = AppData.I.poolByName[typeName];
  if (pc != null) {
    d.cardType = pc.type;
    if (pc.eng) d.prof = 'engineering';
  } else {
    d.cardType = _guessType(cardRaw['type']?.toString() ?? '');
  }

  final key = '${isMine ? "my" : "teammate"}_${cardRaw['id'] ?? ''}';
  final levels = proj['cardLevels'] as Map<String, dynamic>? ?? {};
  final store = (levels[isMine ? 'my' : 'teammate'] as Map<String, dynamic>?) ?? levels;
  d.level = store[key]?.toString() ?? store[cardRaw['id']?.toString()]?.toString() ?? '1';
  if (d.level.isEmpty) d.level = '1';

  final mohua = proj['cardMoHua'] as Map<String, dynamic>? ?? {};
  d.hasMohua = mohua[key] == true;

  final skins = proj['cardSkins'] as Map<String, dynamic>? ?? {};
  d.skinName = skins[key]?.toString() ?? '';

  // 融合
  final f = AppData.I.splitFusion(d.name);
  if (f != null && pack != null) {
    d.fusion = f;
    final mainFile = pack.skinFile(f[0], d.skinName) ?? pack.skinFile(f[0], '');
    d.mainFile = mainFile;
    // 副卡皮肤：fusionSkins[副卡名]（兼容短名键）
    final fSkins = proj['fusionSkins'] as Map<String, dynamic>? ?? {};
    var subSkin = fSkins[f[1]]?.toString() ?? '';
    if (subSkin.isEmpty) {
      fSkins.forEach((k, v) {
        if (AppData.officialName(k) == f[1] && v.toString().isNotEmpty && subSkin.isEmpty) subSkin = v.toString();
      });
    }
    d.subFile = subSkin.isEmpty ? pack.skinFile(f[1], '') : (pack.skinFile(f[1], subSkin) ?? pack.skinFileByAny(subSkin) ?? pack.skinFile(f[1], ''));
    if (d.subFile != null) {
      try { d.subKey = d.subFile!.lastModifiedSync().millisecondsSinceEpoch.toString(); } catch (_) {}
    }
    // 副卡品质（副卡等级盾用自身品质）
    final subPc = AppData.I.poolByName[f[1]];
    d.subCardType = subPc?.type ?? d.cardType;
    final fLv = proj['fusionLevels'] as Map<String, dynamic>? ?? {};
    d.subLevel = fLv[f[1]]?.toString() ?? '1';
    final fMh = proj['fusionMoHua'] as Map<String, dynamic>? ?? {};
    d.subMohua = fMh[f[1]] == true;
  } else if (pack != null) {
    d.mainFile = pack.skinFile(official, d.skinName) ?? pack.skinFileByName(d.name) ?? pack.skinFileByName(official);
  }
  if (d.mainFile != null) {
    try { d.mainKey = d.mainFile!.lastModifiedSync().millisecondsSinceEpoch.toString(); } catch (_) {}
  }
  d.filled = d.name.isNotEmpty;
  return d;
}

String _guessType(String t) {
  switch (t) {
    case '金': return 'gold';
    case '紫': return 'purple';
    case '蓝': return 'blue';
    case '绿': return 'green';
    default: return t;
  }
}
