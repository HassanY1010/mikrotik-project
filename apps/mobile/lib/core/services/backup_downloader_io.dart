import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Saves the binary backup file to local device storage without transmitting it anywhere.
/// Throws an informative exception if writing fails or is truncated.
Future<String> saveBackupLocally(String filename, List<int> bytes) async {
  if (bytes.isEmpty) {
    throw Exception('بيانات النسخة الاحتياطية فارغة (0 بايت)');
  }

  Directory? targetDir;
  try {
    targetDir = await getDownloadsDirectory();
  } catch (_) {
    targetDir = null;
  }

  if (targetDir == null) {
    try {
      targetDir = await getApplicationDocumentsDirectory();
    } catch (_) {
      targetDir = await getTemporaryDirectory();
    }
  }

  final filePath = '${targetDir.path}/$filename';
  final file = File(filePath);

  try {
    await file.writeAsBytes(bytes, flush: true);
  } catch (e) {
    throw Exception('فشل حفظ الملف على وحدة التخزين (${e.toString()}): يرجى التحقق من أذونات التخزين والمساحة المتاحة');
  }

  // Strict verification: file exists and byte length matches 100%
  final exists = await file.exists();
  final writtenLength = exists ? await file.length() : 0;
  if (!exists || writtenLength != bytes.length) {
    throw Exception('فشل التحقق من اكتمال كتابة الملف: الحجم المكتوب ($writtenLength بايت) لا يطابق المستلم (${bytes.length} بايت)');
  }

  return file.path;
}

/// Explicitly shares the backup file only upon direct user request
Future<void> shareBackupFile(String filePath, String filename) async {
  final file = File(filePath);
  if (!await file.exists()) {
    throw Exception('الملف غير موجود في المسار المحدد: $filePath');
  }

  await Share.shareXFiles(
    [XFile(file.path)],
    text: 'نسخة احتياطية لمايكروتك: $filename',
  );
}
