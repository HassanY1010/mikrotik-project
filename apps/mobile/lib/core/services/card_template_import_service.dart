import 'dart:convert';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';
import '../models/models.dart';

class CardTemplateValidationResult {
  final bool isValid;
  final String? errorMessage;
  final CardTemplateModel? template;

  bool get isSuccess => isValid;

  const CardTemplateValidationResult.success(this.template)
      : isValid = true,
        errorMessage = null;

  const CardTemplateValidationResult.failure(this.errorMessage)
      : isValid = false,
        template = null;
}

class CardTemplateImportResult {
  final bool isSuccess;
  final bool isCancelled;
  final String? errorMessage;
  final CardTemplateModel? template;

  const CardTemplateImportResult.success(this.template)
      : isSuccess = true,
        isCancelled = false,
        errorMessage = null;

  const CardTemplateImportResult.cancelled()
      : isSuccess = false,
        isCancelled = true,
        errorMessage = null,
        template = null;

  const CardTemplateImportResult.failure(this.errorMessage)
      : isSuccess = false,
        isCancelled = false,
        template = null;
}

class CardTemplateMediaImportResult {
  final bool isSuccess;
  final bool isCancelled;
  final String? errorMessage;
  final Uint8List? imageBytes;
  final String? fileName;
  final bool isPdf;
  final int totalPdfPages;
  final List<Uint8List> pdfPageThumbnails;

  const CardTemplateMediaImportResult.success({
    required this.imageBytes,
    required this.fileName,
    this.isPdf = false,
    this.totalPdfPages = 1,
    this.pdfPageThumbnails = const [],
  })  : isSuccess = true,
        isCancelled = false,
        errorMessage = null;

  const CardTemplateMediaImportResult.cancelled()
      : isSuccess = false,
        isCancelled = true,
        errorMessage = null,
        imageBytes = null,
        fileName = null,
        isPdf = false,
        totalPdfPages = 0,
        pdfPageThumbnails = const [];

  const CardTemplateMediaImportResult.failure(this.errorMessage)
      : isSuccess = false,
        isCancelled = false,
        imageBytes = null,
        fileName = null,
        isPdf = false,
        totalPdfPages = 0,
        pdfPageThumbnails = const [];
}

class CardTemplateImportService {
  /// Maximum allowed file size for template JSON files (200 KB)
  static const int maxFileSizeBytes = 200 * 1024;

  /// Returns the catalog of built-in ready-made templates available in SudaFi
  static List<CardTemplateModel> getBuiltInCatalog() {
    return [
      CardTemplateModel(
        id: 'builtin-football',
        name: 'ثيم كرة القدم الذهبي (85×54 مم)',
        themePreset: 'FOOTBALL',
        primaryColor: '#065F46',
        accentColor: '#F59E0B',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        isDefault: true,
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'سودافاي هوتسبوت',
          'headerTitle': 'كأس الذهب - فائق السرعة',
          'instructions': 'امسح الرمز أو أدخل اسم المستخدم للدخول',
        },
      ),
      CardTemplateModel(
        id: 'builtin-eid',
        name: 'عيد مبارك الملكي (85×54 مم)',
        themePreset: 'EID_MUBARAK',
        primaryColor: '#1E3A8A',
        accentColor: '#D97706',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'شبكة العيد الملكية',
          'headerTitle': 'كل عام وأنتم بخير',
          'instructions': 'اتصل بالشبكة وسجل الدخول برمز الكرت',
        },
      ),
      CardTemplateModel(
        id: 'builtin-turquoise',
        name: 'الفيروزي الحديث (85×54 مم)',
        themePreset: 'TURQUOISE',
        primaryColor: '#0F766E',
        accentColor: '#06B6D4',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'شبكة المستقبل الرقمية',
          'headerTitle': 'إنترنت رقمي فائق الجودة',
          'instructions': 'امسح الرمز للدخول الفوري للشبكة',
        },
      ),
      CardTemplateModel(
        id: 'builtin-ticket',
        name: 'تذكرة كلاسيكية (100×40 مم)',
        themePreset: 'TICKET',
        primaryColor: '#4338CA',
        accentColor: '#EC4899',
        widthMm: 100,
        heightMm: 40,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'تذكرة إنترنت هوتسبوت',
          'headerTitle': 'تذكرة تسجيل الدخول السريع',
          'instructions': 'الرمز صالح للاستخدام بجهاز واحد فقط',
        },
      ),
      CardTemplateModel(
        id: 'builtin-compact',
        name: 'مدمج أنيق (70×35 مم)',
        themePreset: 'COMPACT',
        primaryColor: '#334155',
        accentColor: '#64748B',
        widthMm: 70,
        heightMm: 35,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'بطاقة الاتصال المدمجة',
          'headerTitle': 'كرت مدمج عالي الكفاءة',
          'instructions': 'أدخل اسم المستخدم للاتصال',
        },
      ),
      CardTemplateModel(
        id: 'builtin-mini',
        name: 'شبكة مصغرة مكثفة (50×30 مم)',
        themePreset: 'MINI',
        primaryColor: '#4F46E5',
        accentColor: '#06B6D4',
        widthMm: 50,
        heightMm: 30,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': false,
          'networkName': 'سودافاي شبكة سريعة',
          'headerTitle': 'طباعة مكثفة واقتصادية',
          'instructions': 'امسح الرمز أو أدخل الكود',
        },
      ),
      CardTemplateModel(
        id: 'builtin-sudafi-brand',
        name: 'هوية سودافي الرسمية (85×54 مم)',
        themePreset: 'CLASSIC',
        primaryColor: '#114C54',
        accentColor: '#CEAE85',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'سودافاي | SudaFi Net',
          'headerTitle': 'كرت إنترنت فائق السرعة',
          'instructions': 'امسح رمز QR أو أدخل رمز الدخول للاتصال المباشر',
        },
      ),
      CardTemplateModel(
        id: 'builtin-portrait',
        name: 'كرت عمودي هوتسبوت (54×85 مم)',
        themePreset: 'CLASSIC',
        primaryColor: '#1E3A8A',
        accentColor: '#10B981',
        widthMm: 54,
        heightMm: 85,
        orientation: 'portrait',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'شبكة سودافي العمودية',
          'headerTitle': 'بطاقة مستخدم الهوتسبوت',
          'instructions': 'امسح الرمز للاتصال',
        },
      ),
    ];
  }

  /// Validates a raw JSON string and converts it into a verified CardTemplateModel
  static CardTemplateValidationResult validateAndParseTemplateJson(String jsonStr) {
    if (jsonStr.trim().isEmpty) {
      return const CardTemplateValidationResult.failure('الملف فارغ ولا يحتوي على أي بيانات.');
    }

    if (utf8.encode(jsonStr).length > maxFileSizeBytes) {
      return const CardTemplateValidationResult.failure(
        'حجم ملف القالب كبير جداً (الحد الأقصى 200 كيلوبايت).',
      );
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(jsonStr);
    } catch (_) {
      return const CardTemplateValidationResult.failure(
        'صيغة الملف غير مدعومة. يجب أن يكون الملف بصيغة JSON صالحة خاصة بقوالب سودافي.',
      );
    }

    if (decoded is! Map<String, dynamic>) {
      return const CardTemplateValidationResult.failure(
        'محتوى الملف غير صالح. يجب أن يحتوي على كائن قالب صحيح.',
      );
    }

    // Name validation
    final name = decoded['name']?.toString().trim();
    if (name == null || name.isEmpty) {
      return const CardTemplateValidationResult.failure(
        'ملف القالب غير صالح: حقل اسم القالب (name) مطلوب.',
      );
    }

    // Dimensions validation
    final widthMm = (decoded['widthMm'] as num?)?.toInt() ?? 85;
    final heightMm = (decoded['heightMm'] as num?)?.toInt() ?? 54;

    if (widthMm < 10 || widthMm > 1000 || heightMm < 10 || heightMm > 1000) {
      return const CardTemplateValidationResult.failure(
        'أبعاد القالب غير صالحة. يجب أن يكون العرض والارتفاع بين 10 مم و 1000 مم.',
      );
    }

    // Orientation validation
    String orientation = decoded['orientation']?.toString().toLowerCase().trim() ?? 'landscape';
    if (orientation != 'landscape' && orientation != 'portrait') {
      orientation = 'landscape';
    }

    // Color normalization
    String primaryColor = decoded['primaryColor']?.toString().trim() ?? '#1E3A8A';
    if (!primaryColor.startsWith('#')) primaryColor = '#$primaryColor';
    if (primaryColor.length != 7 && primaryColor.length != 9) {
      primaryColor = '#1E3A8A';
    }

    String accentColor = decoded['accentColor']?.toString().trim() ?? '#10B981';
    if (!accentColor.startsWith('#')) accentColor = '#$accentColor';
    if (accentColor.length != 7 && accentColor.length != 9) {
      accentColor = '#10B981';
    }

    // Theme preset
    String themePreset = decoded['themePreset']?.toString().toUpperCase().trim() ?? 'CLASSIC';

    // Layout config
    Map<String, dynamic> layoutConfig = {};
    if (decoded['layoutConfig'] is Map) {
      layoutConfig = Map<String, dynamic>.from(decoded['layoutConfig'] as Map);
    }
    for (final key in [
      'showQr',
      'showPin',
      'showPrice',
      'showValidity',
      'showSpeed',
      'showLogo',
      'showSerial',
      'networkName',
      'supportPhone',
      'headerTitle',
      'instructions'
    ]) {
      if (decoded.containsKey(key) && !layoutConfig.containsKey(key)) {
        layoutConfig[key] = decoded[key];
      }
    }

    final template = CardTemplateModel(
      id: 'imported-${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      widthMm: widthMm,
      heightMm: heightMm,
      orientation: orientation,
      themePreset: themePreset,
      primaryColor: primaryColor,
      accentColor: accentColor,
      layoutConfig: layoutConfig,
      backgroundDesign: decoded['backgroundDesign']?.toString(),
      isDefault: false,
    );

    return CardTemplateValidationResult.success(template);
  }

  /// Opens the device file picker to choose and import a template file
  static Future<CardTemplateImportResult> importTemplateFromFile() async {
    try {
      final pickerResult = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json', 'sudafi', 'template', 'txt'],
        withData: true,
      );

      if (pickerResult == null || pickerResult.files.isEmpty) {
        return const CardTemplateImportResult.cancelled();
      }

      final file = pickerResult.files.single;

      String? fileContent;
      if (file.bytes != null) {
        fileContent = utf8.decode(file.bytes!, allowMalformed: true);
      } else if (file.path != null && file.path!.isNotEmpty) {
        final ioFile = File(file.path!);
        if (await ioFile.exists()) {
          fileContent = await ioFile.readAsString();
        }
      }

      if (fileContent == null || fileContent.trim().isEmpty) {
        return const CardTemplateImportResult.failure(
          'تعذر قراءة محتوى الملف أو الملف فارغ.',
        );
      }

      final validation = validateAndParseTemplateJson(fileContent);
      if (!validation.isValid) {
        return CardTemplateImportResult.failure(validation.errorMessage);
      }

      return CardTemplateImportResult.success(validation.template);
    } on PlatformException catch (e) {
      return CardTemplateImportResult.failure(
        'تم رفض إذن الوصول إلى ملفات الهاتف أو حدث خطأ في النظام: ${e.message ?? e.code}',
      );
    } catch (e) {
      return CardTemplateImportResult.failure(
        'فشل استيراد القالب: ${e.toString()}',
      );
    }
  }

  /// Maximum allowed file size for image designs (8 MB)
  static const int maxImageFileSizeBytes = 8 * 1024 * 1024;

  /// Maximum allowed file size for PDF designs (15 MB)
  static const int maxPdfFileSizeBytes = 15 * 1024 * 1024;

  /// Validates raw image bytes (PNG, JPEG, WebP)
  static String? validateImageBytes(Uint8List bytes) {
    if (bytes.isEmpty) {
      return 'ملف الصورة فارغ ولا يحتوي على أي بيانات.';
    }
    if (bytes.length > maxImageFileSizeBytes) {
      return 'حجم ملف الصورة كبير جداً (الحد الأقصى 8 ميجابايت).';
    }

    final isPng = bytes.length >= 8 &&
        bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4E &&
        bytes[3] == 0x47;

    final isJpeg = bytes.length >= 3 &&
        bytes[0] == 0xFF &&
        bytes[1] == 0xD8 &&
        bytes[2] == 0xFF;

    final isWebp = bytes.length >= 12 &&
        bytes[0] == 0x52 &&
        bytes[1] == 0x49 &&
        bytes[2] == 0x46 &&
        bytes[3] == 0x46 && // 'RIFF'
        bytes[8] == 0x57 &&
        bytes[9] == 0x45 &&
        bytes[10] == 0x42 &&
        bytes[11] == 0x50; // 'WEBP'

    if (!isPng && !isJpeg && !isWebp) {
      return 'صيغة الصورة غير مدعومة أو الملف تالف. يدعم التطبيق صيغ PNG و JPG و WebP.';
    }

    return null;
  }

  /// Validates raw PDF bytes
  static String? validatePdfBytes(Uint8List bytes) {
    if (bytes.isEmpty) {
      return 'ملف الـ PDF فارغ ولا يحتوي على أي بيانات.';
    }
    if (bytes.length > maxPdfFileSizeBytes) {
      return 'حجم ملف الـ PDF كبير جداً (الحد الأقصى 15 ميجابايت).';
    }

    // %PDF- magic bytes: 0x25, 0x50, 0x44, 0x46, 0x2D
    final isPdf = bytes.length >= 5 &&
        bytes[0] == 0x25 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x44 &&
        bytes[3] == 0x46 &&
        bytes[4] == 0x2D;

    if (!isPdf) {
      return 'الملف ليس مستند PDF صالحاً أو الملف تالف.';
    }

    return null;
  }

  /// Opens the device file picker to choose an image file (PNG, JPG, WebP)
  static Future<CardTemplateMediaImportResult> importImageFromFile() async {
    try {
      final pickerResult = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
        withData: true,
      );

      if (pickerResult == null || pickerResult.files.isEmpty) {
        return const CardTemplateMediaImportResult.cancelled();
      }

      final file = pickerResult.files.single;
      Uint8List? bytes = file.bytes;
      if (bytes == null && file.path != null && file.path!.isNotEmpty) {
        final ioFile = File(file.path!);
        if (await ioFile.exists()) {
          bytes = await ioFile.readAsBytes();
        }
      }

      if (bytes == null || bytes.isEmpty) {
        return const CardTemplateMediaImportResult.failure(
          'تعذر قراءة بيانات ملف الصورة المحدد.',
        );
      }

      final validationError = validateImageBytes(bytes);
      if (validationError != null) {
        return CardTemplateMediaImportResult.failure(validationError);
      }

      String suggestedName = file.name;
      final dotIdx = suggestedName.lastIndexOf('.');
      if (dotIdx > 0) suggestedName = suggestedName.substring(0, dotIdx);

      return CardTemplateMediaImportResult.success(
        imageBytes: bytes,
        fileName: suggestedName,
        isPdf: false,
      );
    } on PlatformException catch (e) {
      return CardTemplateMediaImportResult.failure(
        'تم رفض إذن الوصول إلى ملفات الهاتف أو حدث خطأ في النظام: ${e.message ?? e.code}',
      );
    } catch (e) {
      return CardTemplateMediaImportResult.failure(
        'فشل استيراد ملف الصورة: ${e.toString()}',
      );
    }
  }

  /// Opens the device file picker to choose a PDF file and converts page(s) to images
  static Future<CardTemplateMediaImportResult> importPdfFromFile({int pageIndex = 0}) async {
    try {
      final pickerResult = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
        withData: true,
      );

      if (pickerResult == null || pickerResult.files.isEmpty) {
        return const CardTemplateMediaImportResult.cancelled();
      }

      final file = pickerResult.files.single;
      Uint8List? bytes = file.bytes;
      if (bytes == null && file.path != null && file.path!.isNotEmpty) {
        final ioFile = File(file.path!);
        if (await ioFile.exists()) {
          bytes = await ioFile.readAsBytes();
        }
      }

      if (bytes == null || bytes.isEmpty) {
        return const CardTemplateMediaImportResult.failure(
          'تعذر قراءة بيانات ملف الـ PDF المحدد.',
        );
      }

      final validationError = validatePdfBytes(bytes);
      if (validationError != null) {
        return CardTemplateMediaImportResult.failure(validationError);
      }

      final List<Uint8List> pageThumbnails = [];
      try {
        await for (final page in Printing.raster(bytes, dpi: 150.0)) {
          final pngBytes = await page.toPng();
          pageThumbnails.add(pngBytes);
          if (pageThumbnails.length >= 10) break; // Maximum 10 pages for preview
        }
      } catch (err) {
        // Fallback for mock/test environments
      }

      if (pageThumbnails.isEmpty) {
        return const CardTemplateMediaImportResult.failure(
          'تعذر معالجة صفحات مستند الـ PDF أو المستند تالف.',
        );
      }

      final effectiveIndex = pageIndex.clamp(0, pageThumbnails.length - 1);
      final selectedPageBytes = pageThumbnails[effectiveIndex];

      String suggestedName = file.name;
      final dotIdx = suggestedName.lastIndexOf('.');
      if (dotIdx > 0) suggestedName = suggestedName.substring(0, dotIdx);

      return CardTemplateMediaImportResult.success(
        imageBytes: selectedPageBytes,
        fileName: suggestedName,
        isPdf: true,
        totalPdfPages: pageThumbnails.length,
        pdfPageThumbnails: pageThumbnails,
      );
    } on PlatformException catch (e) {
      return CardTemplateMediaImportResult.failure(
        'تم رفض إذن الوصول إلى ملفات الهاتف أو حدث خطأ في النظام: ${e.message ?? e.code}',
      );
    } catch (e) {
      return CardTemplateMediaImportResult.failure(
        'فشل استيراد مستند الـ PDF: ${e.toString()}',
      );
    }
  }

  /// Creates a ready-to-use CardTemplateModel from an imported image or PDF page
  static CardTemplateModel createTemplateFromMedia({
    required Uint8List imageBytes,
    required String name,
    int widthMm = 85,
    int heightMm = 54,
    String orientation = 'landscape',
    String themePreset = 'CLASSIC',
    String primaryColor = '#114C54',
    String accentColor = '#CEAE85',
    bool showQr = true,
    bool showPin = true,
    bool showPrice = true,
    bool showValidity = true,
    bool showSpeed = true,
    String networkName = 'سودافاي | SudaFi Net',
    String headerTitle = 'كرت إنترنت فائق السرعة',
    String instructions = 'امسح رمز QR أو أدخل رمز الدخول للاتصال',
    bool isPdf = false,
    bool isDefault = false,
  }) {
    final base64Image = base64Encode(imageBytes);

    return CardTemplateModel(
      id: 'imported-media-${DateTime.now().millisecondsSinceEpoch}',
      name: name.trim().isNotEmpty ? name.trim() : (isPdf ? 'تصميم PDF مستورد' : 'تصميم صورة مستورد'),
      widthMm: widthMm.clamp(10, 1000),
      heightMm: heightMm.clamp(10, 1000),
      orientation: orientation,
      themePreset: themePreset,
      primaryColor: primaryColor,
      accentColor: accentColor,
      backgroundDesign: isPdf ? 'custom_pdf_page' : 'custom_image',
      layoutConfig: {
        'backgroundImageBase64': base64Image,
        'backgroundFit': 'cover',
        'isImageBackground': !isPdf,
        'isPdfBackground': isPdf,
        'showQr': showQr,
        'showPin': showPin,
        'showPrice': showPrice,
        'showValidity': showValidity,
        'showSpeed': showSpeed,
        'networkName': networkName,
        'headerTitle': headerTitle,
        'instructions': instructions,
      },
      isDefault: isDefault,
    );
  }
}
