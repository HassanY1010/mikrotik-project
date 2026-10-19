Future<String> saveBackupLocally(String filename, List<int> bytes) async {
  throw UnsupportedError('Platform not supported for saving backup file');
}

Future<void> shareBackupFile(String filePath, String filename) async {
  throw UnsupportedError('Platform not supported for sharing backup file');
}
