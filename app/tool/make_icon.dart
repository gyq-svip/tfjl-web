// 生成应用图标：从火灵长图裁剪人物 → 各尺寸 mipmap + iOS AppIcon
import 'dart:io';
import 'package:image/image.dart' as img;

void main() {
  final src = img.decodeImage(File(r'C:\Users\gyq\.workbuddy\clipboard-images\clipboard-2026-11-21T06-43-50-178Z-5a74e995.jpg').readAsBytesSync());
  if (src == null) { print('read fail'); return; }
  // 人物在长图下半部：裁 (70,370)-(500,800)
  final crop = img.copyCrop(src, x: 70, y: 370, width: 430, height: 430);
  final icon = img.copyResize(crop, width: 1024, height: 1024, interpolation: img.Interpolation.cubic);

  // Android mipmap
  final sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192};
  sizes.forEach((k, s) {
    final out = img.copyResize(icon, width: s, height: s, interpolation: img.Interpolation.cubic);
    final dir = 'android/app/src/main/res/mipmap-$k';
    Directory(dir).createSync(recursive: true);
    File('$dir/ic_launcher.png').writeAsBytesSync(img.encodePng(out));
    File('$dir/ic_launcher_foreground.png').writeAsBytesSync(img.encodePng(out));
  });
  // iOS AppIcon
  final iosDir = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
  Directory(iosDir).createSync(recursive: true);
  final i1024 = img.copyResize(icon, width: 1024, height: 1024, interpolation: img.Interpolation.cubic);
  File('$iosDir/Icon-App-1024x1024@1x.png').writeAsBytesSync(img.encodePng(i1024));
  print('icons generated');
}
