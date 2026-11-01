import 'dart:io';
import 'color_analyzer.dart';

class RefactorResult {
  final String filePath;
  final int replacementsCount;
  final bool importAdded;

  RefactorResult({
    required this.filePath,
    required this.replacementsCount,
    required this.importAdded,
  });
}

class SafeRefactorer {
  static RefactorResult refactorFile(File file, List<ColorOccurrence> violations) {
    if (violations.isEmpty) {
      return RefactorResult(filePath: file.path, replacementsCount: 0, importAdded: false);
    }

    var content = file.readAsStringSync();
    var replacementsCount = 0;

    for (final v in violations) {
      if (v.suggestedReplacement == null) continue;

      final target = v.rawMatch;
      final replacement = v.suggestedReplacement!;

      if (content.contains(target)) {
        content = content.replaceAll(target, replacement);
        replacementsCount++;
      }
    }

    // Clean up any accidental "const AppTheme.primary" -> "AppTheme.primary"
    if (content.contains('const AppTheme.primary')) {
      content = content.replaceAll('const AppTheme.primary', 'AppTheme.primary');
    }

    // Ensure app_theme.dart is imported if AppTheme is referenced
    var importAdded = false;
    if (content.contains('AppTheme.') && !content.contains('app_theme.dart')) {
      // Find where imports end
      final importLines = content.split('\n');
      var lastImportIndex = -1;
      for (var i = 0; i < importLines.length; i++) {
        if (importLines[i].startsWith('import ')) {
          lastImportIndex = i;
        }
      }

      const importStmt = "import 'package:mobile/core/theme/app_theme.dart';";
      if (lastImportIndex != -1) {
        importLines.insert(lastImportIndex + 1, importStmt);
        content = importLines.join('\n');
      } else {
        content = '$importStmt\n$content';
      }
      importAdded = true;
    }

    if (replacementsCount > 0 || importAdded) {
      file.writeAsStringSync(content);
    }

    return RefactorResult(
      filePath: file.path,
      replacementsCount: replacementsCount,
      importAdded: importAdded,
    );
  }
}
