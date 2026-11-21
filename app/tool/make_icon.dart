// 生成应用图标：用 D:/SYS/Pictures/火灵.png（透明背景立绘）→ 自动裁人物 → 保留透明背景
import 'dart:io';
import 'package:image/image.dart' as img;

void main() {
  final src = img.decodeImage(File(r'D:/SYS/Pictures/火灵.png').readAsBytesSync());
  if (src == null) { print('read fail'); return; }
  print('src ${src.width}x${src.height} hasAlpha=${src.hasAlpha}');

  // 自动检测非透明边界（阈值 alpha>24），留出边距
  int minX = src.width, minY = src.height, maxX = 0, maxY = 0;
  for (var y = 0; y < src.height; y += 2) {
    for (var x = 0; x < src.width; x += 2) {
      final c = src.getPixel(x, y);
      if (c.a > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  print('bbox $minX,$minY - $maxX,$maxY');
  if (maxX <= minX || maxY <= minY) { print('no content'); return; }
  final pad = 8;
  minX = (minX - pad).clamp(0, src.width - 1);
  minY = (minY - pad).clamp(0, src.height - 1);
  maxX = (maxX + pad).clamp(0, src.width - 1);
  maxY = (maxY + pad).clamp(0, src.height - 1);
  final person = img.copyCrop(src, x: minX, y: minY, width: maxX - minX, height: maxY - minY);

  // 保持透明背景，人物缩放占 80%，居中（略上移）
  img.Image build(int size) {
    final canvas = img.Image(width: size, height: size); // 默认透明
    final scale = (size * 0.80) / (person.width > person.height ? person.width : person.height);
    final pw = (person.width * scale).round();
    final ph = (person.height * scale).round();
    final resized = img.copyResize(person, width: pw, height: ph, interpolation: img.Interpolation.cubic);
    img.compositeImage(canvas, resized,
        dstX: (size - pw) ~/ 2, dstY: (size - ph) ~/ 2 - (size * 0.02).round());
    return canvas;
  }

  final big = build(1024);
  File(r'D:/WorkBuddy_ai/data/IosAndApk/shots/icon_transparent_preview.png')
      .writeAsBytesSync(img.encodePng(big));

  final sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192};
  sizes.forEach((k, s) {
    final o = build(s);
    final dir = 'android/app/src/main/res/mipmap-$k';
    Directory(dir).createSync(recursive: true);
    File('$dir/ic_launcher.png').writeAsBytesSync(img.encodePng(o));
    File('$dir/ic_launcher_foreground.png').writeAsBytesSync(img.encodePng(o));
  });
  final iosDir = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
  Directory(iosDir).createSync(recursive: true);
  File('$iosDir/Icon-App-1024x1024@1x.png').writeAsBytesSync(img.encodePng(big));
  print('icons generated');
}
