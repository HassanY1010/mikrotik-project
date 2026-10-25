import 'dart:convert';
import 'dart:typed_data';
import 'package:archive/archive.dart';

class PortalFileItem {
  final String path;
  final String content;
  final bool isBinary;
  final int sizeBytes;

  PortalFileItem({
    required this.path,
    required this.content,
    required this.isBinary,
    required this.sizeBytes,
  });

  Map<String, dynamic> toJson() => {
        'name': path,
        'content': content,
        'encoding': isBinary ? 'base64' : 'utf-8',
      };
}

class PortalValidationReport {
  final bool isValid;
  final String? mainHtmlPath;
  final List<String> errors;
  final List<String> warnings;
  final List<String> missingLocalFiles;
  final List<String> externalUrls;
  final Map<String, bool> hotspotFeatures;
  final String? detectedFormAction;

  PortalValidationReport({
    required this.isValid,
    this.mainHtmlPath,
    required this.errors,
    required this.warnings,
    required this.missingLocalFiles,
    required this.externalUrls,
    required this.hotspotFeatures,
    this.detectedFormAction,
  });
}

class ImportedPortalBundle {
  final String bundleName;
  final List<PortalFileItem> files;
  final String? mainHtmlPath;
  final String? mainHtmlContent;
  final PortalValidationReport report;
  final int totalBytes;

  ImportedPortalBundle({
    required this.bundleName,
    required this.files,
    this.mainHtmlPath,
    this.mainHtmlContent,
    required this.report,
    required this.totalBytes,
  });
}

class HotspotPortalValidator {
  static const Set<String> forbiddenExtensions = {
    '.exe',
    '.bat',
    '.cmd',
    '.sh',
    '.php',
    '.py',
    '.vbs',
    '.bin',
    '.msi',
    '.dll',
  };

  static const Set<String> binaryExtensions = {
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.ttf',
    '.woff',
    '.woff2',
    '.eot',
    '.otf',
    '.mp3',
    '.wav',
    '.mp4',
  };

  /// Parses and validates a single HTML file selected from phone storage.
  static ImportedPortalBundle processSingleHtml({
    required String filename,
    required Uint8List bytes,
  }) {
    final cleanName = filename.split('/').last.split('\\').last;
    final htmlContent = utf8.decode(bytes, allowMalformed: true);

    final fileItem = PortalFileItem(
      path: cleanName.toLowerCase().endsWith('.html') || cleanName.toLowerCase().endsWith('.htm')
          ? cleanName
          : '$cleanName.html',
      content: htmlContent,
      isBinary: false,
      sizeBytes: bytes.length,
    );

    final report = validateBundle([fileItem]);

    return ImportedPortalBundle(
      bundleName: cleanName,
      files: [fileItem],
      mainHtmlPath: fileItem.path,
      mainHtmlContent: htmlContent,
      report: report,
      totalBytes: bytes.length,
    );
  }

  /// Extracts and validates a ZIP archive containing HTML and its assets.
  static ImportedPortalBundle processZipArchive({
    required String zipFilename,
    required Uint8List zipBytes,
  }) {
    final cleanZipName = zipFilename.split('/').last.split('\\').last;
    final List<PortalFileItem> extractedFiles = [];
    final List<String> extractionErrors = [];

    Archive archive;
    try {
      archive = ZipDecoder().decodeBytes(zipBytes);
    } catch (e) {
      final failReport = PortalValidationReport(
        isValid: false,
        errors: ['فشل فك ضغط ملف الأرشيف ZIP. الملف قد يكون تالفاً أو غير صالح: $e'],
        warnings: [],
        missingLocalFiles: [],
        externalUrls: [],
        hotspotFeatures: {},
      );
      return ImportedPortalBundle(
        bundleName: cleanZipName,
        files: [],
        report: failReport,
        totalBytes: zipBytes.length,
      );
    }

    int totalUncompressedBytes = 0;
    const int maxTotalBytes = 15 * 1024 * 1024; // 15MB max uncompressed size
    const int maxFilesAllowed = 150;

    for (final file in archive) {
      if (!file.isFile) continue; // Skip directory entries
      if (extractedFiles.length >= maxFilesAllowed) {
        extractionErrors.add('تجاوز الأرشيف الحد الأقصى المسموح به لعدد الملفات ($maxFilesAllowed ملف).');
        break;
      }

      // Normalize path (convert backslashes, strip leading slashes, remove ..)
      String normPath = file.name.replaceAll('\\', '/').replaceAll(RegExp(r'^/+'), '');
      if (normPath.isEmpty) continue;

      // Skip macOS resource fork or hidden files
      if (normPath.contains('__MACOSX') || normPath.split('/').last.startsWith('.')) {
        continue;
      }

      if (normPath.contains('..') || normPath.contains(':')) {
        extractionErrors.add('تم رفض مسار غير آمن في الأرشيف ($normPath)');
        continue;
      }

      final ext = normPath.contains('.') ? normPath.substring(normPath.lastIndexOf('.')).toLowerCase() : '';
      if (forbiddenExtensions.contains(ext)) {
        extractionErrors.add('تم حظر ملف بامتداد غير مسموح به أمنياً ($normPath)');
        continue;
      }

      final fileBytes = file.content as List<int>;
      totalUncompressedBytes += fileBytes.length;

      if (totalUncompressedBytes > maxTotalBytes) {
        extractionErrors.add('تجاوز الحجم الإجمالي للأرشيف الحد الأقصى الآمن (15 ميغابايت).');
        break;
      }

      final isBin = binaryExtensions.contains(ext);
      String content;
      if (isBin) {
        content = base64Encode(fileBytes);
      } else {
        content = utf8.decode(fileBytes, allowMalformed: true);
      }

      extractedFiles.add(
        PortalFileItem(
          path: normPath,
          content: content,
          isBinary: isBin,
          sizeBytes: fileBytes.length,
        ),
      );
    }

    // Detect and strip single common root folder if all files are inside a subfolder
    List<PortalFileItem> normalizedFiles = extractedFiles;
    if (extractedFiles.isNotEmpty && extractedFiles.every((f) => f.path.contains('/'))) {
      final firstPrefix = '${extractedFiles.first.path.split('/').first}/';
      final allSharePrefix = extractedFiles.every((f) => f.path.startsWith(firstPrefix));
      if (allSharePrefix) {
        normalizedFiles = extractedFiles
            .map(
              (f) => PortalFileItem(
                path: f.path.substring(firstPrefix.length),
                content: f.content,
                isBinary: f.isBinary,
                sizeBytes: f.sizeBytes,
              ),
            )
            .toList();
      }
    }

    final report = validateBundle(normalizedFiles, preErrors: extractionErrors);

    String? mainContent;
    if (report.mainHtmlPath != null) {
      final mainItem = normalizedFiles.firstWhere(
        (f) => f.path.toLowerCase() == report.mainHtmlPath!.toLowerCase(),
        orElse: () => normalizedFiles.first,
      );
      mainContent = mainItem.content;
    }

    return ImportedPortalBundle(
      bundleName: cleanZipName,
      files: normalizedFiles,
      mainHtmlPath: report.mainHtmlPath,
      mainHtmlContent: mainContent,
      report: report,
      totalBytes: totalUncompressedBytes,
    );
  }

  /// Comprehensive safety, asset references, and MikroTik HotSpot compatibility inspection.
  static PortalValidationReport validateBundle(
    List<PortalFileItem> files, {
    List<String> preErrors = const [],
  }) {
    final List<String> errors = List.from(preErrors);
    final List<String> warnings = [];
    final List<String> missingLocalFiles = [];
    final List<String> externalUrls = [];

    if (files.isEmpty) {
      errors.add('لم يتم العثور على أي ملفات صالحة في الحزمة المستوردة.');
      return PortalValidationReport(
        isValid: false,
        errors: errors,
        warnings: warnings,
        missingLocalFiles: [],
        externalUrls: [],
        hotspotFeatures: {},
      );
    }

    // 1. Identify main HTML file (login.html prioritized, then index.html, then first .html)
    PortalFileItem? mainHtmlFile;
    for (final f in files) {
      final nameLower = f.path.toLowerCase();
      if (nameLower.endsWith('login.html') || nameLower.endsWith('login.htm')) {
        mainHtmlFile = f;
        break;
      }
    }
    if (mainHtmlFile == null) {
      for (final f in files) {
        final nameLower = f.path.toLowerCase();
        if (nameLower.endsWith('index.html') || nameLower.endsWith('index.htm')) {
          mainHtmlFile = f;
          break;
        }
      }
    }
    if (mainHtmlFile == null) {
      for (final f in files) {
        if (f.path.toLowerCase().endsWith('.html') || f.path.toLowerCase().endsWith('.htm')) {
          mainHtmlFile = f;
          break;
        }
      }
    }

    if (mainHtmlFile == null) {
      errors.add('حزمة الصفحة تفتقد إلى ملف HTML رئيسي (مثل login.html). يلزم وجود صفحة لتسجيل الدخول.');
      return PortalValidationReport(
        isValid: false,
        errors: errors,
        warnings: warnings,
        missingLocalFiles: [],
        externalUrls: [],
        hotspotFeatures: {},
      );
    }

    final mainHtmlPath = mainHtmlFile.path;
    final htmlContent = mainHtmlFile.content;

    // Create normalized set of available file paths in bundle
    final availablePaths = files.map((f) => f.path.toLowerCase()).toSet();
    final availableBaseNames = files.map((f) => f.path.split('/').last.toLowerCase()).toSet();

    // 2. Scan for asset references in HTML (links, scripts, images, sources, CSS url)
    final assetRegex = RegExp(
      r'''(?:href|src)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)''',
      caseSensitive: false,
    );

    final matches = assetRegex.allMatches(htmlContent);
    final Set<String> checkedReferences = {};

    for (final m in matches) {
      String ref = (m.group(1) ?? m.group(2) ?? '').trim();
      if (ref.isEmpty || ref.startsWith('#') || ref.startsWith('data:') || ref.startsWith('javascript:')) {
        continue;
      }

      // Strip query parameters and fragment (e.g. "style.css?v=2#main" -> "style.css")
      final cleanRef = ref.split('?').first.split('#').first.trim();
      if (cleanRef.isEmpty || checkedReferences.contains(cleanRef)) continue;
      checkedReferences.add(cleanRef);

      // Check if external resource
      if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://') || cleanRef.startsWith('//')) {
        if (!externalUrls.contains(cleanRef)) {
          externalUrls.add(cleanRef);
        }
        continue;
      }

      // Check local relative file existence
      final cleanRefLower = cleanRef.replaceAll('\\', '/').replaceAll(RegExp(r'^/+'), '').toLowerCase();
      final baseName = cleanRefLower.split('/').last;

      final exists = availablePaths.contains(cleanRefLower) || availableBaseNames.contains(baseName);
      if (!exists && !missingLocalFiles.contains(cleanRef)) {
        missingLocalFiles.add(cleanRef);
      }
    }

    // Warnings for missing local assets
    if (missingLocalFiles.isNotEmpty) {
      warnings.add(
        'الملفات التالية مشار إليها داخل الصفحة ولكنها غير موجودة في المجلد (${missingLocalFiles.length}): ${missingLocalFiles.take(3).join(', ')}${missingLocalFiles.length > 3 ? '...' : ''}. قد تظهر بعض الصور أو الأنماط غير مكتملة.',
      );
    }

    // Warnings for external URLs
    if (externalUrls.isNotEmpty) {
      warnings.add(
        'تم رصد موارد خارجية (${externalUrls.length}) مثل خطوط أو مكتبات CDN. تنبيه: المشتركون غير المسجلين لن يتمكنوا من تحميل هذه الموارد لغياب الإنترنت قبل تسجيل الدخول، ما لم تتم إضافتها إلى Walled Garden.',
      );
    }

    // Advisory for large media assets (> 2MB)
    final oversizedFiles = files.where((f) => f.isBinary && f.sizeBytes > 2 * 1024 * 1024).toList();
    if (oversizedFiles.isNotEmpty) {
      warnings.add(
        'تم رصد ملفات وسائط بحجم كبير (أكثر من 2 ميغابايت) مثل: ${oversizedFiles.map((f) => f.path).take(2).join(", ")}. تنبيه: الملفات الكبيرة قد تستهلك مساحة تخزين الراوتر وتؤخر ظهور صفحة الدخول على هواتف المشتركين.',
      );
    }

    // 3. Inspect MikroTik HotSpot Specific Tags & Forms
    final hotspotFeatures = <String, bool>{};

    // Form Action check
    final formMatch = RegExp(r'<form[^>]*action=["\u0027]([^"\u0027]*)["\u0027]', caseSensitive: false).firstMatch(htmlContent);
    final detectedFormAction = formMatch?.group(1);

    final hasHotspotAction = htmlContent.contains(r'$(link-login-only)') ||
        htmlContent.contains(r'$(link-login)') ||
        (detectedFormAction != null && detectedFormAction.contains('login'));
    hotspotFeatures['hasLoginForm'] = hasHotspotAction;

    // Inputs check
    final hasUsername = RegExp(r'<input[^>]*name=["\u0027]username["\u0027]', caseSensitive: false).hasMatch(htmlContent);
    final hasPassword = RegExp(r'<input[^>]*name=["\u0027]password["\u0027]', caseSensitive: false).hasMatch(htmlContent);
    hotspotFeatures['hasUsername'] = hasUsername;
    hotspotFeatures['hasPassword'] = hasPassword;

    // Error variable check
    final hasError = htmlContent.contains(r'$(error)');
    hotspotFeatures['hasErrorVariable'] = hasError;

    // CHAP variables check
    final hasChap = htmlContent.contains(r'$(chap-id)') || htmlContent.contains(r'$(chap-challenge)');
    hotspotFeatures['hasChapVariables'] = hasChap;

    if (!hasHotspotAction) {
      warnings.add(
        'نموذج تسجيل الدخول لا يحتوي على متغير MikroTik القياسي \$(link-login-only). إذا كانت الصفحة عادية، تأكد من إرسال بيانات الدخول إلى الراوتر.',
      );
    }

    if (!hasUsername) {
      warnings.add('لم يتم العثور على حقل إدخال اسم المستخدم/الكرت (name="username").');
    }

    if (!hasError) {
      warnings.add('الصفحة لا تحتوي على متغير عرض الخطأ \$(error) لإشعار المستخدم في حال كان الكرت منتهي الصلاحية أو غير صحيح.');
    }

    return PortalValidationReport(
      isValid: errors.isEmpty,
      mainHtmlPath: mainHtmlPath,
      errors: errors,
      warnings: warnings,
      missingLocalFiles: missingLocalFiles,
      externalUrls: externalUrls,
      hotspotFeatures: hotspotFeatures,
      detectedFormAction: detectedFormAction,
    );
  }
}
