import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import '../../../core/services/mikrotik_discovery_service.dart';
import '../../../core/theme/app_theme.dart';

/// Opens the existing Quick Add MikroTik Router bottom sheet
/// (LAN discovery, IP, router name, password, test connection, save & link).
void showQuickAddRouterModal(BuildContext context, WidgetRef ref) {
  final nameCtrl = TextEditingController();
  final hostCtrl = TextEditingController(text: '192.168.88.1');
  final passCtrl = TextEditingController();
  bool obscurePassword = true;
  bool isScanningLan = false;
  String? scanStatusMessage;
  final List<DiscoveredRouterModel> discoveredRouters = [];

  bool isTesting = false;
  bool isSaving = false;
  String? testStatusMessage;
  bool? testStatusSuccess;

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => StatefulBuilder(
      builder: (modalContext, setModalState) {
        final isDark = Theme.of(modalContext).brightness == Brightness.dark;
        final sheetBg = isDark ? const Color(0xFF1E293B) : Colors.white;

        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(modalContext).viewInsets.bottom,
          ),
          child: Container(
            decoration: BoxDecoration(
              color: sheetBg,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            ),
            padding: const EdgeInsets.all(20),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.router_rounded, color: AppTheme.primary, size: 24),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'إضافة راوتر MikroTik',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            Text(
                              'إدخال بيانات الراوتر الأساسية لربطه بالحساب مباشرة',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  // زر بحث عن الراوترات (LAN Discovery)
                  OutlinedButton.icon(
                    onPressed: isScanningLan
                        ? null
                        : () async {
                            setModalState(() {
                              isScanningLan = true;
                              scanStatusMessage = 'جارِ فحص الشبكة والاستماع لبروتوكول MNDP...';
                              discoveredRouters.clear();
                            });
                            try {
                              final discovery = ref.read(mikrotikDiscoveryServiceProvider);
                              await for (final r in discovery.discoverStream(
                                timeout: const Duration(seconds: 8),
                                onProgress: (p, s) {
                                  setModalState(() {
                                    scanStatusMessage = s;
                                  });
                                },
                              )) {
                                setModalState(() {
                                  if (!discoveredRouters.any((d) => d.ip == r.ip)) {
                                    discoveredRouters.add(r);
                                  }
                                });
                              }
                            } catch (e) {
                              debugPrint('Discovery error: $e');
                            } finally {
                              setModalState(() {
                                isScanningLan = false;
                                if (discoveredRouters.isEmpty) {
                                  scanStatusMessage = 'لم يتم العثور على أجهزة MikroTik عبر الشبكة المحلية (يمكنك كتابة عنوان IP يدوياً).';
                                } else {
                                  scanStatusMessage = 'تم اكتشاف ${discoveredRouters.length} راوتر. اضغط لاختيار الراوتر وتعبئة عنوان IP تلقائياً:';
                                }
                              });
                            }
                          },
                    icon: isScanningLan
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.wifi_find_rounded, size: 20),
                    label: Text(
                      isScanningLan ? 'جارِ فحص الراوترات...' : 'بحث عن الراوترات',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primary,
                      side: const BorderSide(color: AppTheme.primary, width: 1.5),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                  if (scanStatusMessage != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      scanStatusMessage!,
                      style: TextStyle(
                        fontSize: 12,
                        color: isScanningLan ? AppTheme.primary : (discoveredRouters.isEmpty ? Colors.orange : Colors.green.shade700),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                  if (discoveredRouters.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      constraints: const BoxConstraints(maxHeight: 140),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.grey.withValues(alpha: 0.2)),
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: discoveredRouters.length,
                        separatorBuilder: (context, index) => const Divider(height: 1),
                        itemBuilder: (c, idx) {
                          final dev = discoveredRouters[idx];
                          final isSel = hostCtrl.text.trim() == dev.ip.trim();
                          return ListTile(
                            dense: true,
                            leading: Icon(
                              Icons.router_rounded,
                              color: isSel ? Colors.green : AppTheme.primary,
                              size: 20,
                            ),
                            title: Text(
                              dev.identity.isNotEmpty ? dev.identity : (dev.model ?? 'MikroTik'),
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            subtitle: Text(
                              '${dev.ip}  •  ${dev.rosVersion}${dev.model != null ? ' • ${dev.model}' : ''}',
                              style: const TextStyle(fontSize: 11),
                            ),
                            trailing: isSel
                                ? const Icon(Icons.check_circle, color: Colors.green, size: 18)
                                : const Text(
                                    'اختيار',
                                    style: TextStyle(
                                      color: AppTheme.primary,
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                            onTap: () {
                              setModalState(() {
                                hostCtrl.text = dev.ip;
                                if (nameCtrl.text.isEmpty) {
                                  nameCtrl.text = dev.identity.isNotEmpty ? dev.identity : (dev.model ?? 'MikroTik');
                                }
                                testStatusMessage = 'تم اختيار الراوتر وتعبئة عنوان IP تلقائياً: ${dev.ip}';
                                testStatusSuccess = true;
                              });
                            },
                          );
                        },
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  // حقل 1: عنوان IP
                  TextField(
                    controller: hostCtrl,
                    keyboardType: TextInputType.text,
                    decoration: const InputDecoration(
                      labelText: 'عنوان IP',
                      hintText: '192.168.88.1',
                      prefixIcon: Icon(Icons.lan_outlined),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // حقل 2: اسم الراوتر
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'اسم الراوتر',
                      hintText: 'مثال: HAMDI NET',
                      prefixIcon: Icon(Icons.badge_outlined),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // حقل 3: كلمة المرور
                  TextField(
                    controller: passCtrl,
                    obscureText: obscurePassword,
                    decoration: InputDecoration(
                      labelText: 'كلمة المرور',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        onPressed: () => setModalState(() => obscurePassword = !obscurePassword),
                      ),
                    ),
                  ),
                  if (testStatusMessage != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: testStatusSuccess == true
                            ? Colors.green.withValues(alpha: 0.15)
                            : Colors.red.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: testStatusSuccess == true ? Colors.green : Colors.red,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            testStatusSuccess == true ? Icons.check_circle : Icons.error,
                            color: testStatusSuccess == true ? Colors.green : Colors.red,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              testStatusMessage!,
                              style: TextStyle(
                                fontSize: 12,
                                color: testStatusSuccess == true ? Colors.green : Colors.red,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: isTesting || isSaving
                              ? null
                              : () async {
                                  setModalState(() {
                                    isTesting = true;
                                    testStatusMessage = null;
                                  });
                                  final discovery = ref.read(mikrotikDiscoveryServiceProvider);
                                  final host = hostCtrl.text.trim();
                                  final pass = passCtrl.text;

                                  if (discovery.isPrivateLanIp(host)) {
                                    try {
                                      final check = await discovery.checkDirectLanConnection(
                                        host: host,
                                        port: 8728,
                                        user: 'admin',
                                        password: pass,
                                        useSsl: false,
                                      );
                                      setModalState(() {
                                        isTesting = false;
                                        testStatusSuccess = check.isReachable && check.isAuthValid;
                                        testStatusMessage = check.isAuthValid
                                            ? 'تم الاتصال بالراوتر بنجاح محلياً (${check.detectedOsVersion ?? 'ROS'}).'
                                            : (check.isReachable
                                                ? 'تم الوصول للراوتر ولكن كلمة المرور غير صحيحة.'
                                                : 'تعذر الوصول لمنفذ الراوتر عبر الشبكة المحلية.');
                                      });
                                    } catch (err) {
                                      setModalState(() {
                                        isTesting = false;
                                        testStatusSuccess = false;
                                        testStatusMessage = 'فشل فحص الاتصال: $err';
                                      });
                                    }
                                  } else {
                                    final res = await ref.read(routersProvider.notifier).testConnectionDirect({
                                      'host': host,
                                      'apiPort': 8728,
                                      'username': 'admin',
                                      'password': pass,
                                      'useSsl': false,
                                    });
                                    setModalState(() {
                                      isTesting = false;
                                      testStatusSuccess = res['success'] == true;
                                      testStatusMessage = res['message']?.toString() ?? 'تم الفحص';
                                    });
                                  }
                                },
                          icon: isTesting
                              ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.wifi_find_rounded, size: 18),
                          label: const Text('فحص الاتصال'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: isSaving
                              ? null
                              : () async {
                                  final host = hostCtrl.text.trim();
                                  var name = nameCtrl.text.trim();
                                  if (host.isEmpty) {
                                    setModalState(() {
                                      testStatusSuccess = false;
                                      testStatusMessage = 'يرجى إدخال عنوان IP للراوتر.';
                                    });
                                    return;
                                  }
                                  if (name.isEmpty) {
                                    name = 'MikroTik ($host)';
                                  }
                                  setModalState(() => isSaving = true);
                                  final payload = {
                                    'name': name,
                                    'host': host,
                                    'apiPort': 8728,
                                    'restPort': 443,
                                    'rosVersion': 'V7',
                                    'username': 'admin',
                                    'password': passCtrl.text,
                                    'useSsl': false,
                                  };
                                  final saveRes = await ref.read(routersProvider.notifier).saveRouter(payload);
                                  setModalState(() => isSaving = false);
                                  if (saveRes['success'] == true) {
                                    final newId = saveRes['data']?['id']?.toString() ?? saveRes['id']?.toString();
                                    if (newId != null) {
                                      ref.read(routersProvider.notifier).cacheSessionPassword(newId, passCtrl.text);
                                      ref.read(selectedRouterIdProvider.notifier).select(newId);
                                    }
                                    await ref.read(routersProvider.notifier).refresh();
                                    if (modalContext.mounted) {
                                      Navigator.pop(modalContext);
                                    }
                                    if (context.mounted) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text('تمت إضافة الراوتر ($name) بنجاح!'),
                                          backgroundColor: const Color(0xFF16A34A),
                                        ),
                                      );
                                    }
                                  } else {
                                    setModalState(() {
                                      testStatusSuccess = false;
                                      testStatusMessage = saveRes['message']?.toString() ?? 'فشل حفظ الراوتر';
                                    });
                                  }
                                },
                          icon: isSaving
                              ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.check_circle_outline, size: 18),
                          label: const Text('حفظ وربط الراوتر'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );
}
