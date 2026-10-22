import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'create_user_dialog.dart';

class TenantUsersScreen extends ConsumerStatefulWidget {
  const TenantUsersScreen({super.key});

  @override
  ConsumerState<TenantUsersScreen> createState() => _TenantUsersScreenState();
}

class _TenantUsersScreenState extends ConsumerState<TenantUsersScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _handleDeleteUser(UserModel u) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          'تأكيد إزالة الموظف',
          style: TextStyle(color: context.textPrimary, fontSize: 16),
        ),
        content: Text(
          'هل أنت متأكد من إزالة «${u.fullName}» (${u.email})؟ سيفقد الموظف إمكانية الدخول للنظام فوراً، وسيتم الحفاظ على جميع سجلاته ومعاملاته المالية السابقة دون حذف.',
          style: TextStyle(color: context.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('إزالة الحساب', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final res = await ref.read(tenantUsersProvider.notifier).deleteUser(u.id);
      if (!mounted) return;

      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تمت إزالة حساب الموظف بنجاح مع الحفاظ على سجلاته'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['message']?.toString() ?? 'فشل إزالة الموظف'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  void _handleToggleStatus(UserModel u) async {
    final isCurrentlyActive = u.isActive;
    final actionText = isCurrentlyActive ? 'تعطيل' : 'تنشيط';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          'تأكيد $actionText الحساب',
          style: TextStyle(color: context.textPrimary, fontSize: 16),
        ),
        content: Text(
          isCurrentlyActive
              ? 'هل أنت متأكد من تعطيل حساب «${u.fullName}»؟ سيتم إبطال جميع جلساته النشطة ومنعه من الوصول إلى النظام فوراً.'
              : 'هل أنت متأكد من إعادة تنشيط حساب «${u.fullName}»؟ سيتمكن من تسجيل الدخول وإدارة الأجهزة المخصصة له.',
          style: TextStyle(color: context.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: isCurrentlyActive ? const Color(0xFFE11D48) : const Color(0xFF10B981),
            ),
            child: Text(
              isCurrentlyActive ? 'تعطيل الحساب' : 'تنشيط الحساب',
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final res = await ref.read(tenantUsersProvider.notifier).toggleUserStatus(u.id, u.status);
      if (!mounted) return;

      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['message']?.toString() ?? 'تم تحديث حالة الموظف بنجاح'),
            backgroundColor: const Color(0xFF10B981),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['message']?.toString() ?? 'فشل تحديث حالة الموظف'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  void _showAssignDevicesDialog(UserModel u) async {
    final routersAsync = ref.read(routersProvider);
    final routers = routersAsync.value ?? [];

    if (routers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('لا توجد أجهزة راوتر مسجلة في شبكتك لتخصيصها'),
          backgroundColor: Color(0xFFEAB308),
        ),
      );
      return;
    }

    final selectedIds = u.assignedDevices.map((d) => d.id).toSet();

    final result = await showDialog<Set<String>>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: context.bgCard,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: Row(
                children: [
                  const Icon(Icons.router_outlined, color: Color(0xFF38BDF8), size: 22),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'تخصيص أجهزة الراوتر: ${u.fullName}',
                      style: TextStyle(color: context.textPrimary, fontSize: 16),
                    ),
                  ),
                ],
              ),
              content: SizedBox(
                width: 360,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'اختر الأجهزة التي يسمح لهذا الموظف بإدارتها. في حال عدم تحديد أي جهاز، سيتم حظر وصوله تلقائياً لجميع الراوترات:',
                      style: TextStyle(color: context.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 280),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: routers.length,
                        separatorBuilder: (ctx, idx) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final r = routers[i];
                          final isChecked = selectedIds.contains(r.id);
                          return CheckboxListTile(
                            value: isChecked,
                            title: Text(
                              r.name,
                              style: TextStyle(
                                color: context.textPrimary,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: Text(
                              r.host,
                              style: TextStyle(color: context.textSecondary, fontSize: 12),
                            ),
                            activeColor: const Color(0xFF38BDF8),
                            checkColor: Colors.black,
                            onChanged: (val) {
                              setDialogState(() {
                                if (val == true) {
                                  selectedIds.add(r.id);
                                } else {
                                  selectedIds.remove(r.id);
                                }
                              });
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.pop(ctx, selectedIds),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563EB)),
                  child: const Text('حفظ التخصيص', style: TextStyle(color: Colors.white)),
                ),
              ],
            );
          },
        );
      },
    );

    if (result != null) {
      final res = await ref.read(tenantUsersProvider.notifier).assignDevices(
            u.id,
            result.toList(),
          );
      if (!mounted) return;

      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم تحديث أجهزة الموظف المخصصة بنجاح'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['message']?.toString() ?? 'فشل تعيين الأجهزة'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  void _showAssignPermissionsDialog(UserModel u) async {
    final availablePermissions = [
      {
        'code': 'finance:view',
        'title': 'عرض التقارير المالية والتدفقات والأرباح',
        'desc': 'الاطلاع على تقارير الأرباح والمصروفات والتدفقات النقدية والمبيعات الشهرية',
      },
      {
        'code': 'expenses:manage',
        'title': 'إدارة المصروفات وتسجيلها',
        'desc': 'إضافة وتعديل وحذف بنود المصروفات والتشغيل',
      },
      {
        'code': 'cards:delete',
        'title': 'حذف وإتلاف كروت الهوتسبوت',
        'desc': 'حذف الكروت أو إلغاء دفعات الكروت غير المباعة',
      },
      {
        'code': 'reports:view',
        'title': 'عرض التقارير والإحصائيات التشغيلية',
        'desc': 'الاطلاع على الجلسات المتصلة وأداء الراوتر وسرعات المستخدمين',
      },
    ];

    final selectedCodes = u.customPermissions.toSet();

    final result = await showDialog<Set<String>>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: context.bgCard,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: Row(
                children: [
                  const Icon(Icons.shield_outlined, color: Color(0xFF10B981), size: 22),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'تخصيص الصلاحيات: ${u.fullName}',
                      style: TextStyle(color: context.textPrimary, fontSize: 16),
                    ),
                  ),
                ],
              ),
              content: SizedBox(
                width: 380,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'فصل الصلاحيات المالية عن التشغيلية لضمان الأمان وخصوصية الحسابات:',
                      style: TextStyle(color: context.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 320),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: availablePermissions.length,
                        separatorBuilder: (ctx, idx) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final p = availablePermissions[i];
                          final code = p['code']!;
                          final isChecked = selectedCodes.contains(code);
                          return CheckboxListTile(
                            value: isChecked,
                            title: Text(
                              p['title']!,
                              style: TextStyle(
                                color: context.textPrimary,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: Text(
                              p['desc']!,
                              style: TextStyle(color: context.textSecondary, fontSize: 11),
                            ),
                            activeColor: const Color(0xFF10B981),
                            checkColor: Colors.black,
                            onChanged: (val) {
                              setDialogState(() {
                                if (val == true) {
                                  selectedCodes.add(code);
                                } else {
                                  selectedCodes.remove(code);
                                }
                              });
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.pop(ctx, selectedCodes),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
                  child: const Text('حفظ الصلاحيات', style: TextStyle(color: Colors.white)),
                ),
              ],
            );
          },
        );
      },
    );

    if (result != null) {
      final res = await ref.read(tenantUsersProvider.notifier).assignPermissions(
            u.id,
            result.toList(),
          );
      if (!mounted) return;

      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم تحديث صلاحيات الموظف بنجاح'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['message']?.toString() ?? 'فشل تعيين الصلاحيات'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  void _showCreateInvitationDialog() async {
    final formKey = GlobalKey<FormState>();
    final fullNameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    String selectedRole = 'CASHIER';

    final routersAsync = ref.read(routersProvider);
    final routers = routersAsync.value ?? [];
    final selectedDeviceIds = <String>{};
    final selectedPermissions = <String>{};

    final createdInvitation = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return AlertDialog(
              backgroundColor: context.bgCard,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: Row(
                children: [
                  const Icon(Icons.mail_outline_rounded, color: Color(0xFF38BDF8), size: 22),
                  const SizedBox(width: 8),
                  Text(
                    'إرسال دعوة انضمام لموظف',
                    style: TextStyle(color: context.textPrimary, fontSize: 16),
                  ),
                ],
              ),
              content: SizedBox(
                width: 380,
                child: Form(
                  key: formKey,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'تتيح الدعوة للموظف إنشاء كلمة مروره الخاصة عبر رابط أحادي الاستخدام صالح لمدة 7 أيام:',
                          style: TextStyle(color: context.textSecondary, fontSize: 12),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: fullNameCtrl,
                          style: TextStyle(color: context.textPrimary, fontSize: 13),
                          decoration: InputDecoration(
                            labelText: 'الاسم الكامل *',
                            labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                          validator: (v) => v == null || v.trim().length < 2 ? 'أدخل الاسم' : null,
                        ),
                        const SizedBox(height: 10),
                        TextFormField(
                          controller: emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          style: TextStyle(color: context.textPrimary, fontSize: 13),
                          decoration: InputDecoration(
                            labelText: 'البريد الإلكتروني *',
                            labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                          validator: (v) =>
                              v == null || !v.contains('@') ? 'بريد إلكتروني غير صالح' : null,
                        ),
                        const SizedBox(height: 10),
                        TextFormField(
                          controller: phoneCtrl,
                          keyboardType: TextInputType.phone,
                          style: TextStyle(color: context.textPrimary, fontSize: 13),
                          decoration: InputDecoration(
                            labelText: 'رقم الهاتف (اختياري)',
                            labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                        const SizedBox(height: 10),
                        DropdownButtonFormField<String>(
                          initialValue: selectedRole,
                          decoration: InputDecoration(
                            labelText: 'الدور الوظيفي',
                            labelStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          ),
                          dropdownColor: context.bgCard,
                          items: const [
                            DropdownMenuItem(value: 'CASHIER', child: Text('كاشير نقطة بيع')),
                            DropdownMenuItem(value: 'MANAGER', child: Text('مدير فرعي / شبكة')),
                          ],
                          onChanged: (v) {
                            if (v != null) setModalState(() => selectedRole = v);
                          },
                        ),
                        if (routers.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          Text(
                            'تخصيص الراوترات المسموح بها مسبقاً:',
                            style: TextStyle(
                              color: context.textPrimary,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            children: routers.map((r) {
                              final isSelected = selectedDeviceIds.contains(r.id);
                              return FilterChip(
                                label: Text(r.name, style: const TextStyle(fontSize: 11)),
                                selected: isSelected,
                                onSelected: (sel) {
                                  setModalState(() {
                                    if (sel) {
                                      selectedDeviceIds.add(r.id);
                                    } else {
                                      selectedDeviceIds.remove(r.id);
                                    }
                                  });
                                },
                              );
                            }).toList(),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('إلغاء', style: TextStyle(color: Color(0xFF94A3B8))),
                ),
                ElevatedButton(
                  onPressed: () async {
                    if (!formKey.currentState!.validate()) return;
                    final res = await ref.read(tenantUsersProvider.notifier).createInvitation(
                          fullName: fullNameCtrl.text.trim(),
                          email: emailCtrl.text.trim(),
                          phone: phoneCtrl.text.trim().isNotEmpty ? phoneCtrl.text.trim() : null,
                          role: selectedRole,
                          assignedDeviceIds:
                              selectedDeviceIds.isNotEmpty ? selectedDeviceIds.toList() : null,
                          permissionCodes:
                              selectedPermissions.isNotEmpty ? selectedPermissions.toList() : null,
                        );
                    if (ctx.mounted) {
                      Navigator.pop(ctx, res);
                    }
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF38BDF8)),
                  child: const Text('إرسال الدعوة', style: TextStyle(color: Colors.black)),
                ),
              ],
            );
          },
        );
      },
    );

    if (createdInvitation != null && mounted) {
      if (createdInvitation['success'] == true) {
        final url = createdInvitation['invitationUrl']?.toString() ??
            createdInvitation['token']?.toString() ??
            '';

        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: context.bgCard,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Row(
              children: [
                Icon(Icons.check_circle_outline, color: Color(0xFF10B981), size: 24),
                SizedBox(width: 8),
                Text('تم إنشاء الدعوة بنجاح', style: TextStyle(fontSize: 16)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'يمكنك نسخ رابط الدعوة وإرساله للموظف عبر واتساب أو تليجرام لتعيين كلمة مروره:',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 12),
                if (url.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: context.bgScaffold,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: SelectableText(
                      url,
                      style: const TextStyle(fontSize: 11, color: Color(0xFF38BDF8)),
                    ),
                  ),
              ],
            ),
            actions: [
              if (url.isNotEmpty)
                TextButton.icon(
                  icon: const Icon(Icons.copy, size: 16),
                  label: const Text('نسخ الرابط'),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: url));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('تم نسخ رابط الدعوة إلى الحافظة'),
                        backgroundColor: Color(0xFF10B981),
                      ),
                    );
                  },
                ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('تم'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(createdInvitation['message']?.toString() ?? 'فشل إنشاء الدعوة'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  Color _roleColor(String role) {
    switch (role.toUpperCase()) {
      case 'SUPER_ADMIN':
      case 'TENANT_ADMIN':
      case 'OWNER':
      case 'ADMIN':
        return const Color(0xFFF59E0B);
      case 'MANAGER':
        return const Color(0xFF38BDF8);
      case 'CASHIER':
      default:
        return const Color(0xFF10B981);
    }
  }

  @override
  Widget build(BuildContext context) {
    final usersAsync = ref.watch(tenantUsersProvider);
    final invitationsAsync = ref.watch(staffInvitationsProvider);

    return Scaffold(
      backgroundColor: context.bgScaffold,
      appBar: AppBar(
        backgroundColor: context.bgCard,
        elevation: 0,
        title: const Text(
          'فريق العمل والصلاحيات',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFF38BDF8),
          tabs: [
            Tab(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.people_alt_outlined, size: 18),
                  const SizedBox(width: 8),
                  Text('الموظفون (${usersAsync.value?.length ?? 0})'),
                ],
              ),
            ),
            Tab(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.mail_outline_rounded, size: 18),
                  const SizedBox(width: 8),
                  Text('الدعوات المعلقة (${invitationsAsync.value?.length ?? 0})'),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: () {
              ref.read(tenantUsersProvider.notifier).refresh();
              ref.read(staffInvitationsProvider.notifier).refresh();
            },
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Tab 1: Staff Members
          _buildStaffTab(usersAsync),

          // Tab 2: Invitations
          _buildInvitationsTab(invitationsAsync),
        ],
      ),
    );
  }

  Widget _buildStaffTab(AsyncValue<List<UserModel>> usersAsync) {
    return Column(
      children: [
        // Action Buttons Bar
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: context.bgCard,
            border: Border(bottom: BorderSide(color: context.borderColor)),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () async {
                        final created = await CreateUserDialog.show(context);
                        if (created == true) {
                          ref.read(tenantUsersProvider.notifier).refresh();
                        }
                      },
                      icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                      label: const Text('إضافة موظف مباشر'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _showCreateInvitationDialog,
                      icon: const Icon(Icons.send_rounded, size: 18),
                      label: const Text('إرسال رابط دعوة'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF38BDF8),
                        side: const BorderSide(color: Color(0xFF38BDF8)),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _searchController,
                style: TextStyle(color: context.textPrimary, fontSize: 13),
                decoration: InputDecoration(
                  hintText: 'بحث باسم الموظف أو البريد...',
                  hintStyle: TextStyle(color: context.textSecondary, fontSize: 12),
                  prefixIcon: Icon(Icons.search, color: context.textSecondary, size: 18),
                  suffixIcon: _searchQuery.isNotEmpty
                      ? IconButton(
                          icon: Icon(Icons.clear, color: context.textSecondary, size: 16),
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _searchQuery = '');
                          },
                        )
                      : null,
                  filled: true,
                  fillColor: context.bgScaffold,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: context.borderColor),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: context.borderColor),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: Color(0xFF38BDF8)),
                  ),
                ),
                onChanged: (v) => setState(() => _searchQuery = v.trim().toLowerCase()),
              ),
            ],
          ),
        ),

        // Staff List
        Expanded(
          child: usersAsync.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: Color(0xFF38BDF8)),
            ),
            error: (err, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: Color(0xFFEF4444)),
                    const SizedBox(height: 12),
                    Text(
                      'فشل تحميل المستخدمين: $err',
                      style: const TextStyle(color: Color(0xFF94A3B8)),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () => ref.read(tenantUsersProvider.notifier).refresh(),
                      child: const Text('إعادة المحاولة'),
                    ),
                  ],
                ),
              ),
            ),
            data: (users) {
              final filtered = users.where((u) {
                return _searchQuery.isEmpty ||
                    u.fullName.toLowerCase().contains(_searchQuery) ||
                    u.email.toLowerCase().contains(_searchQuery);
              }).toList();

              if (filtered.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.people_outline,
                            size: 64, color: Colors.white.withValues(alpha: 0.2)),
                        const SizedBox(height: 16),
                        const Text(
                          'لا يوجد موظفون مسجلون',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'يمكنك إضافة كاشير أو مدير أو إرسال دعوة انضمام من الأزرار بالأعلى.',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: filtered.length,
                itemBuilder: (ctx, idx) {
                  final u = filtered[idx];
                  return _buildUserCard(u);
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildUserCard(UserModel u) {
    final roleColor = _roleColor(u.role);
    final isSuspended = u.isSuspended;
    final isTenantAdmin = u.isTenantAdmin;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isSuspended ? const Color(0xFFE11D48).withValues(alpha: 0.5) : context.borderColor,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Avatar, Name, Badges
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: roleColor.withValues(alpha: 0.2),
                child: Icon(Icons.person, color: roleColor, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            u.fullName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        // Role Badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: roleColor.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: roleColor),
                          ),
                          child: Text(
                            u.roleDisplayName,
                            style: TextStyle(
                              color: roleColor,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        // Status Badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: (isSuspended ? const Color(0xFFE11D48) : const Color(0xFF10B981))
                                .withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isSuspended ? const Color(0xFFE11D48) : const Color(0xFF10B981),
                            ),
                          ),
                          child: Text(
                            isSuspended ? 'معطل' : 'نشط',
                            style: TextStyle(
                              color: isSuspended ? const Color(0xFFE11D48) : const Color(0xFF10B981),
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      u.email,
                      style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                    ),
                    if (u.phone != null && u.phone!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        'الهاتف: ${u.phone}',
                        style: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
                      ),
                    ],
                  ],
                ),
              ),
              // Delete Button (only for non-admin)
              if (!isTenantAdmin)
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 20),
                  tooltip: 'إزالة الموظف',
                  onPressed: () => _handleDeleteUser(u),
                ),
            ],
          ),

          const Divider(height: 20),

          // Assigned Routers Section
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.router_outlined, size: 16, color: Color(0xFF38BDF8)),
              const SizedBox(width: 6),
              const Text(
                'الراوترات المخصصة:',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.bold),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: isTenantAdmin
                    ? const Text(
                        'وصول كامل لجميع راوترات المنظومة',
                        style: TextStyle(color: Color(0xFFF59E0B), fontSize: 11, fontWeight: FontWeight.w600),
                      )
                    : u.assignedDevices.isEmpty
                        ? const Text(
                            '⚠️ لا يوجد راوترات مخصصة (الوصول مقيد بالكامل)',
                            style: TextStyle(color: Color(0xFFF59E0B), fontSize: 11),
                          )
                        : Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            children: u.assignedDevices.map((d) {
                              return Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF38BDF8).withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.3)),
                                ),
                                child: Text(
                                  d.name,
                                  style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 10),
                                ),
                              );
                            }).toList(),
                          ),
              ),
            ],
          ),

          // Custom Permissions Section (for non-admins)
          if (!isTenantAdmin && u.customPermissions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.shield_outlined, size: 16, color: Color(0xFF10B981)),
                const SizedBox(width: 6),
                const Text(
                  'صلاحيات إضافية:',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: u.customPermissions.map((code) {
                      String label = code;
                      if (code == 'finance:view') label = 'عرض المالية والأرباح';
                      if (code == 'expenses:manage') label = 'إدارة المصروفات';
                      if (code == 'cards:delete') label = 'حذف الكروت';
                      if (code == 'reports:view') label = 'التقارير التشغيلية';
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          label,
                          style: const TextStyle(color: Color(0xFF10B981), fontSize: 10),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ],

          // Action Toolbar for Non-Admins
          if (!isTenantAdmin) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showAssignDevicesDialog(u),
                    icon: const Icon(Icons.router, size: 14),
                    label: const Text('تخصيص الأجهزة', style: TextStyle(fontSize: 11)),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      foregroundColor: const Color(0xFF38BDF8),
                      side: const BorderSide(color: Color(0xFF38BDF8)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showAssignPermissionsDialog(u),
                    icon: const Icon(Icons.shield_outlined, size: 14),
                    label: const Text('الصلاحيات', style: TextStyle(fontSize: 11)),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      foregroundColor: const Color(0xFF10B981),
                      side: const BorderSide(color: Color(0xFF10B981)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _handleToggleStatus(u),
                    icon: Icon(
                      isSuspended ? Icons.play_arrow_rounded : Icons.pause_rounded,
                      size: 14,
                    ),
                    label: Text(
                      isSuspended ? 'تنشيط' : 'تعطيل',
                      style: TextStyle(
                        fontSize: 11,
                        color: isSuspended ? const Color(0xFF10B981) : const Color(0xFFE11D48),
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      foregroundColor:
                          isSuspended ? const Color(0xFF10B981) : const Color(0xFFE11D48),
                      side: BorderSide(
                        color: isSuspended ? const Color(0xFF10B981) : const Color(0xFFE11D48),
                      ),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInvitationsTab(AsyncValue<List<StaffInvitationModel>> invitationsAsync) {
    return invitationsAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(color: Color(0xFF38BDF8)),
      ),
      error: (err, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Color(0xFFEF4444)),
              const SizedBox(height: 12),
              Text(
                'فشل تحميل الدعوات: $err',
                style: const TextStyle(color: Color(0xFF94A3B8)),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.read(staffInvitationsProvider.notifier).refresh(),
                child: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      ),
      data: (invitations) {
        if (invitations.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.mail_outline, size: 64, color: Colors.white.withValues(alpha: 0.2)),
                  const SizedBox(height: 16),
                  const Text(
                    'لا توجد دعوات انضمام معلقة',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'يمكنك إنشاء دعوة جديدة برابط أحادي الاستخدام ليقوم الموظف بتعيين كلمة مروره بنفسه.',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    onPressed: _showCreateInvitationDialog,
                    icon: const Icon(Icons.send_rounded, size: 16),
                    label: const Text('إرسال دعوة الآن'),
                  ),
                ],
              ),
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: invitations.length,
          itemBuilder: (ctx, idx) {
            final inv = invitations[idx];
            final isExpired = inv.isExpired;
            final isAccepted = inv.isAccepted;

            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: context.bgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                        child: const Icon(Icons.mail_outline, color: Color(0xFF38BDF8), size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              inv.fullName,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                            Text(
                              inv.email,
                              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      // Status Badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: (isAccepted
                                  ? const Color(0xFF10B981)
                                  : isExpired
                                      ? const Color(0xFFEF4444)
                                      : const Color(0xFFF59E0B))
                              .withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isAccepted
                                ? const Color(0xFF10B981)
                                : isExpired
                                    ? const Color(0xFFEF4444)
                                    : const Color(0xFFF59E0B),
                          ),
                        ),
                        child: Text(
                          isAccepted
                              ? 'مقبولة'
                              : isExpired
                                  ? 'منتهية الصلاحية'
                                  : 'معلقة (صالحة)',
                          style: TextStyle(
                            color: isAccepted
                                ? const Color(0xFF10B981)
                                : isExpired
                                    ? const Color(0xFFEF4444)
                                    : const Color(0xFFF59E0B),
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (inv.expiresAt != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      'تنتهي الصلاحية: ${DateFormat('yyyy-MM-dd HH:mm').format(inv.expiresAt!)}',
                      style: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
                    ),
                  ],
                  const SizedBox(height: 10),
                  // Actions Row
                  Row(
                    children: [
                      if (inv.invitationUrl != null && !isAccepted && !isExpired)
                        TextButton.icon(
                          icon: const Icon(Icons.copy, size: 14),
                          label: const Text('نسخ الرابط', style: TextStyle(fontSize: 11)),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: inv.invitationUrl!));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('تم نسخ رابط الدعوة إلى الحافظة'),
                                backgroundColor: Color(0xFF10B981),
                              ),
                            );
                          },
                        ),
                      if (!isAccepted) ...[
                        TextButton.icon(
                          icon: const Icon(Icons.refresh, size: 14),
                          label: const Text('تجديد الدعوة', style: TextStyle(fontSize: 11)),
                          onPressed: () async {
                            final res = await ref
                                .read(staffInvitationsProvider.notifier)
                                .resend(inv.id);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(res['message']?.toString() ?? 'تم تجديد الدعوة'),
                                  backgroundColor: res['success'] == true
                                      ? const Color(0xFF10B981)
                                      : const Color(0xFFEF4444),
                                ),
                              );
                            }
                          },
                        ),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 18),
                          tooltip: 'إلغاء الدعوة',
                          onPressed: () async {
                            final res = await ref
                                .read(staffInvitationsProvider.notifier)
                                .cancel(inv.id);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(res['message']?.toString() ?? 'تم إلغاء الدعوة'),
                                  backgroundColor: res['success'] == true
                                      ? const Color(0xFF10B981)
                                      : const Color(0xFFEF4444),
                                ),
                              );
                            }
                          },
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
