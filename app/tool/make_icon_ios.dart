// 生成 iOS AppIcon 全尺寸：以现有 Icon-App-1024x1024@1x.png（火灵立绘）为源。
// 🔴 iOS 图标必须不带 alpha：透明背景在 iPhone 桌面/App Store 会变成黑色底。
//    所以先把 1024 图压平到白底，再缩放出全部尺寸，覆盖写入 AppIcon.appiconset。
import 'dart:io';
import 'package:image/image.dart' as img;

void main() {
  const dir = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
  final src = img.decodeImage(File('$dir/Icon-App-1024x1024@1x.png').readAsBytesSync());
  if (src == null) { print('read 1024 fail'); return; }

  // 压平到白底（消除 alpha，避免 iPhone 桌面黑底）
  final flat = img.Image(width: src.width, height: src.height);
  img.fill(flat, color: img.ColorRgba8(255, 255, 255, 255));
  img.compositeImage(flat, src);

  // 与 Flutter 默认 Contents.json 对应的全尺寸表
  final sizes = <String, int>{
    'Icon-App-20x20@1x.png': 20,
    'Icon-App-20x20@2x.png': 40,
    'Icon-App-20x20@3x.png': 60,
    'Icon-App-29x29@1x.png': 29,
    'Icon-App-29x29@2x.png': 58,
    'Icon-App-29x29@3x.png': 87,
    'Icon-App-40x40@1x.png': 40,
    'Icon-App-40x40@2x.png': 80,
    'Icon-App-40x40@3x.png': 120,
    'Icon-App-60x60@2x.png': 120,
    'Icon-App-60x60@3x.png': 180,
    'Icon-App-76x76@1x.png': 76,
    'Icon-App-76x76@2x.png': 152,
    'Icon-App-83.5x83.5@2x.png': 167,
    'Icon-App-1024x1024@1x.png': 1024,
  };
  sizes.forEach((name, s) {
    final o = img.copyResize(flat, width: s, height: s, interpolation: img.Interpolation.cubic);
    File('$dir/$name').writeAsBytesSync(img.encodePng(o));
    print('write $name ($s)');
  });
  print('iOS icons done');
}
