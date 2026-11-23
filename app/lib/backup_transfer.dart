import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'data_store.dart';
import 'dr_system.dart';

/// 📤📥 阵容备份导入导出 —— 与 PC 端「数据导出/导入」同格式（TFJL-backup-*.json）
/// PC 格式：{ version:'2.1', exportDate, categories:[], projects:[扁平项目行], localStorage:{} }
/// PC 项目行是扁平的（name/category/myHandCards/...），APP 本地库是嵌套的 {name, category, project:{...}}
/// 卡结构两边一致：{id, name, placed, isEngineering, profession, type}
class BackupTransfer {
  /// 📥 导入 PC 备份文件。返回结果文案（含导入数量）
  static Future<String> importFromPc(BuildContext context) async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom, allowedExtensions: ['json'], withData: true);
    final path = picked?.files.single.path;
    if (path == null) return '';
    try {
      final txt = await File(path).readAsString();
      final data = jsonDecode(txt);
      if (data is! Map || data['projects'] is! List) {
        return '❌ 文件格式不正确（不是 PC 端导出的 TFJL-backup 备份）';
      }
      final lib = await ProjectLibrary.load();
      final existing = lib.map((e) => (e as Map)['name']?.toString() ?? '').toSet();
      var added = 0, skipped = 0;
      final cats = <String>{};
      for (final row in (data['projects'] as List)) {
        if (row is! Map) continue;
        final name = row['name']?.toString() ?? '';
        if (name.isEmpty) continue;
        if (existing.contains(name)) { skipped++; continue; }
        // 扁平 PC 项目行 → APP 嵌套结构（字段原样拷贝，卡结构两边一致）
        final project = Map<String, dynamic>.from(row);
        project['name'] = name;
        final cat = row['category']?.toString().isNotEmpty == true ? row['category'].toString() : 'PC导入';
        project['category'] = cat;
        cats.add(cat);
        lib.add({'name': name, 'category': cat, 'project': project});
        existing.add(name);
        added++;
      }
      await ProjectLibrary.save(lib);
      // 减伤表随 PC 备份恢复（PC localStorage 里的 tdjl_dr_tables_v2）
      final ls = data['localStorage'];
      if (ls is Map && ls['tdjl_dr_tables_v2'] != null) {
        await DrSystem.restoreFromPcLocal(ls['tdjl_dr_tables_v2'].toString());
      }
      final pcVer = data['version']?.toString() ?? '?';
      return '✅ 导入成功（PC备份 v$pcVer）：新增 $added 个项目${cats.isNotEmpty ? '，分类 ${cats.join('、')}' : ''}${skipped > 0 ? '；跳过 $skipped 个同名' : ''}';
    } catch (e) {
      return '❌ 导入失败：$e';
    }
  }

  /// 📤 导出全部阵容为 PC 兼容备份文件
  static Future<String> exportToPc(BuildContext context) async {
    final lib = await ProjectLibrary.load();
    if (lib.isEmpty) return '本地还没有任何阵容项目';
    final projects = <Map<String, dynamic>>[];
    final cats = <String>[];
    for (final it in lib) {
      final m = it as Map;
      final p = (m['project'] as Map?) ?? {};
      // APP 嵌套结构 → PC 扁平项目行
      final flat = Map<String, dynamic>.from(p);
      flat['name'] = m['name'];
      flat['category'] = m['category'] ?? '默认分类';
      flat['timestamp'] = flat['timestamp'] ?? DateTime.now().toIso8601String();
      projects.add(flat);
      final c = (m['category'] ?? '默认分类').toString();
      if (!cats.contains(c)) cats.add(c);
    }
    final exportData = {
      'version': '2.1',
      'exportDate': DateTime.now().toIso8601String(),
      'categories': cats,
      'projects': projects,
      // 减伤表一起带走（PC 导入时可恢复洗炼/特殊技能）
      'localStorage': {'tdjl_dr_tables_v2': DrSystem.exportForPc()},
    };
    final jsonStr = const JsonEncoder.withIndent('  ').convert(exportData);
    final fileName = 'TFJL-backup-${DateTime.now().toIso8601String().slice(0, 10)}.json';
    final save = await FilePicker.platform.saveFile(fileName: fileName, type: FileType.custom, allowedExtensions: ['json']);
    if (save == null) return '';   // 用户取消
    try {
      final f = File(save);
      await f.writeAsString(jsonStr);
      return '✅ 已导出 ${projects.length} 个项目到：$save（PC 端「导入数据」可直接恢复）';
    } catch (e) {
      return '❌ 写入失败：$e';
    }
  }
}

extension _Slice on String {
  String slice(int start, int end) => substring(start, end < length ? end : length);
}
