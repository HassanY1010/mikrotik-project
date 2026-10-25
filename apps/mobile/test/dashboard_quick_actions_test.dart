import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/constants/api_endpoints.dart';
import 'package:mobile/features/portal/presentation/hotspot_portal_designer_screen.dart';

void main() {
  group('Dashboard Quick Actions & Backup Verification', () {
    test('ApiEndpoints should format backup routes correctly', () {
      const deviceId = 'device-123';
      const filename = 'sudafi_backup_test.backup';

      expect(ApiEndpoints.deviceBackup(deviceId), '/devices/$deviceId/backup');
      expect(ApiEndpoints.deviceBackups(deviceId), '/devices/$deviceId/backups');
      expect(
        ApiEndpoints.deviceBackupDownload(deviceId, filename),
        '/devices/$deviceId/backups/$filename/download',
      );
      expect(
        ApiEndpoints.deviceBackupRestore(deviceId),
        '/devices/$deviceId/backups/restore',
      );
    });

    test('HotspotPortalDesignerScreen can be instantiated cleanly without exceptions', () {
      const screen = HotspotPortalDesignerScreen();
      expect(screen, isNotNull);
    });
  });
}
