// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;

Future<String> saveBackupLocally(String filename, List<int> bytes) async {
  if (bytes.isEmpty) {
    throw Exception('بيانات النسخة الاحتياطية فارغة (0 بايت)');
  }

  try {
    final blob = html.Blob([bytes], 'application/octet-stream');
    final url = html.Url.createObjectUrlFromBlob(blob);
    final anchor = html.AnchorElement(href: url)
      ..target = '_blank'
      ..download = filename;
    html.document.body?.append(anchor);
    anchor.click();
    anchor.remove();
    html.Url.revokeObjectUrl(url);
    return 'تم بدء تنزيل الملف في المتصفح: $filename';
  } catch (e) {
    throw Exception('تعذر بدء تنزيل الملف في المتصفح: ${e.toString()}');
  }
}

Future<void> shareBackupFile(String filePath, String filename) async {
  // On web, file is already downloaded by the browser
}
