// 生成应用图标：从火灵长图裁剪人物（自动去白边）→ 白底圆角 → 各尺寸 mipmap + iOS AppIcon
import 'dart:io';
import 'package:image/image.dart' as img;

void main() {
  final srcPath = r'C:\Users\gyq\.workbuddy\clipboard-images\clipboard-2026-11-21T06-43-50-178Z-5a74e995.jpg';
  final src = img.decodeImage(File(srcPath).readAsBytesSync());
  if (src == null) { print('read fail'); return; }
  print('src ${src.width}x${src.height}');

  // 原图是竖向长图，人物在中部。先裁中间大块，再自动检测非白边界。
  final y0 = (src.height * 0.30).round();
  final y1 = (src.height * 0.72).round();
  final region = img.copyCrop(src, x: 0, y: y0, width: src.width, height: y1 - y0);

  // 自动找非白像素边界（白底 JPEG 有轻微噪点，阈值 235）
  int minX = region.width, minY = region.height, maxX = 0, maxY = 0;
  for (var y = 0; y < region.height; y += 2) {
    for (var x = 0; x < region.width; x += 2) {
      final c = region.getPixel(x, y);
      if (c.r < 235 || c.g < 235 || c.b < 235) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  print('bbox $minX,$minY - $maxX,$maxY');
  if (maxX <= minX || maxY <= minY) { print('no content'); return; }

  final pad = 10;
  minX = (minX - pad).clamp(0, region.width - 1);
  minY = (minY - pad).clamp(0, region.height - 1);
  maxX = (maxX + pad).clamp(0, region.width - 1);
  maxY = (maxY + pad).clamp(0, region.height - 1);
  final person = img.copyCrop(region, x: minX, y: minY, width: maxX - minX, height: maxY - minY);

  // 以较长边为基准，人物等比缩放占 84%，贴在圆角白底上（iOS/Android 通用）
  img.Image buildIcon(int size) {
    final canvas = img.Image(width: size, height: size);
    // 白色底
    img.fill(canvas, color: img.ColorRgb8(255, 255, 255));
    final scale = (size * 0.74) / (person.width > person.height ? person.width : person.height);
    final pw = (person.width * scale).round();
    final ph = (person.height * scale).round();
    final resized = img.copyResize(person, width: pw, height: ph, interpolation: img.Interpolation.cubic);
    img.compositeImage(canvas, resized,
        dstX: (size - pw) ~/ 2,
        dstY: (size - ph) ~/ 2 - (size * 0.03).round());
    return canvas;
  }

  final icon1024 = buildIcon(1024);
  File(r'D:\WorkBuddy_ai\data\IosAndApk\icon-preview.png')
      .writeAsBytesSync(img.encodePng(icon1024));

  // Android mipmap
  final sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192};
  sizes.forEach((k, s) {
    final out = buildIcon(s);
    final dir = 'android/app/src/main/res/mipmap-$k';
    Directory(dir).createSync(recursive: true);
    File('$dir/ic_launcher.png').writeAsBytesSync(img.encodePng(out));
    File('$dir/ic_launcher_foreground.png').writeAsBytesSync(img.encodePng(out));
  });
  // iOS AppIcon（1024 主图）
  final iosDir = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
  Directory(iosDir).createSync(recursive: true);
  File('$iosDir/Icon-App-1024x1024@1x.png').writeAsBytesSync(img.encodePng(icon1024));
  print('icons generated');
}
