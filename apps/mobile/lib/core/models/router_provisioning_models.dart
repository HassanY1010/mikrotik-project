class RouterInterfaceModel {
  final String? id;
  final String name;
  final String type;
  final bool running;
  final bool disabled;
  final String? macAddress;
  final String? comment;
  final int? mtu;

  const RouterInterfaceModel({
    this.id,
    required this.name,
    required this.type,
    this.running = false,
    this.disabled = false,
    this.macAddress,
    this.comment,
    this.mtu,
  });

  factory RouterInterfaceModel.fromJson(Map<String, dynamic> json) {
    return RouterInterfaceModel(
      id: json['id'] as String?,
      name: json['name'] as String? ?? '',
      type: json['type'] as String? ?? 'ether',
      running: json['running'] == true || json['running'] == 'true',
      disabled: json['disabled'] == true || json['disabled'] == 'true',
      macAddress: json['macAddress'] as String?,
      comment: json['comment'] as String?,
      mtu: json['mtu'] is int ? json['mtu'] as int : null,
    );
  }
}

class RouterIpAddressModel {
  final String? id;
  final String address;
  final String? network;
  final String interface;
  final bool disabled;
  final String? comment;

  const RouterIpAddressModel({
    this.id,
    required this.address,
    this.network,
    required this.interface,
    this.disabled = false,
    this.comment,
  });

  factory RouterIpAddressModel.fromJson(Map<String, dynamic> json) {
    return RouterIpAddressModel(
      id: json['id'] as String?,
      address: json['address'] as String? ?? '',
      network: json['network'] as String?,
      interface: json['interface'] as String? ?? '',
      disabled: json['disabled'] == true || json['disabled'] == 'true',
      comment: json['comment'] as String?,
    );
  }
}

class RouterDiscoverySnapshotModel {
  final List<RouterInterfaceModel> interfaces;
  final List<RouterIpAddressModel> ipAddresses;
  final List<String> bridges;
  final List<String> hotspotServers;
  final String version;
  final int cpuLoad;
  final String uptime;

  const RouterDiscoverySnapshotModel({
    required this.interfaces,
    required this.ipAddresses,
    required this.bridges,
    required this.hotspotServers,
    this.version = '',
    this.cpuLoad = 0,
    this.uptime = '',
  });

  factory RouterDiscoverySnapshotModel.fromJson(Map<String, dynamic> json) {
    final ifacesRaw = json['interfaces'] as List<dynamic>? ?? [];
    final ipsRaw = json['ipAddresses'] as List<dynamic>? ?? [];
    final bridgesRaw = json['bridges'] as List<dynamic>? ?? [];
    final hsRaw = json['hotspotServers'] as List<dynamic>? ?? [];
    final res = json['resource'] as Map<String, dynamic>? ?? {};

    return RouterDiscoverySnapshotModel(
      interfaces: ifacesRaw.map((e) => RouterInterfaceModel.fromJson(e as Map<String, dynamic>)).toList(),
      ipAddresses: ipsRaw.map((e) => RouterIpAddressModel.fromJson(e as Map<String, dynamic>)).toList(),
      bridges: bridgesRaw.map((e) => (e['name'] ?? '').toString()).where((s) => s.isNotEmpty).toList(),
      hotspotServers: hsRaw.map((e) => (e['name'] ?? '').toString()).where((s) => s.isNotEmpty).toList(),
      version: res['version']?.toString() ?? '',
      cpuLoad: res['cpuLoad'] is int ? res['cpuLoad'] as int : 0,
      uptime: res['uptime']?.toString() ?? '',
    );
  }
}

class ProvisionWarningModel {
  final String type;
  final String severity; // 'INFO' | 'WARNING' | 'CRITICAL'
  final String message;
  final String? suggestedAction;

  const ProvisionWarningModel({
    required this.type,
    required this.severity,
    required this.message,
    this.suggestedAction,
  });

  factory ProvisionWarningModel.fromJson(Map<String, dynamic> json) {
    return ProvisionWarningModel(
      type: json['type'] as String? ?? 'GENERAL',
      severity: json['severity'] as String? ?? 'WARNING',
      message: json['message'] as String? ?? '',
      suggestedAction: json['suggestedAction'] as String?,
    );
  }
}

class ProvisionConflictModel {
  final String resource;
  final String existingValue;
  final String proposedValue;
  final String details;

  const ProvisionConflictModel({
    required this.resource,
    required this.existingValue,
    required this.proposedValue,
    required this.details,
  });

  factory ProvisionConflictModel.fromJson(Map<String, dynamic> json) {
    return ProvisionConflictModel(
      resource: json['resource'] as String? ?? '',
      existingValue: json['existingValue'] as String? ?? '',
      proposedValue: json['proposedValue'] as String? ?? '',
      details: json['details'] as String? ?? '',
    );
  }
}

class PlannedStepModel {
  final String id;
  final String stage;
  final String title;
  final String description;

  const PlannedStepModel({
    required this.id,
    required this.stage,
    required this.title,
    required this.description,
  });

  factory PlannedStepModel.fromJson(Map<String, dynamic> json) {
    return PlannedStepModel(
      id: json['id'] as String? ?? '',
      stage: json['stage'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
    );
  }
}

class GeneratedCommandModel {
  final String stage;
  final String command;
  final String? description;

  const GeneratedCommandModel({
    required this.stage,
    required this.command,
    this.description,
  });

  factory GeneratedCommandModel.fromJson(Map<String, dynamic> json) {
    return GeneratedCommandModel(
      stage: json['stage'] as String? ?? '',
      command: json['command'] as String? ?? '',
      description: json['description'] as String?,
    );
  }
}

class ProvisionPreviewResponse {
  final String template;
  final String routerVersion;
  final List<PlannedStepModel> plannedSteps;
  final List<GeneratedCommandModel> generatedCommands;
  final List<ProvisionWarningModel> warnings;
  final List<ProvisionConflictModel> conflicts;
  final bool canProceed;
  final bool requiresCleanConfirmation;
  final bool backupRecommended;

  const ProvisionPreviewResponse({
    required this.template,
    required this.routerVersion,
    required this.plannedSteps,
    required this.generatedCommands,
    required this.warnings,
    required this.conflicts,
    required this.canProceed,
    required this.requiresCleanConfirmation,
    required this.backupRecommended,
  });

  factory ProvisionPreviewResponse.fromJson(Map<String, dynamic> json) {
    final stepsRaw = json['plannedSteps'] as List<dynamic>? ?? [];
    final cmdsRaw = json['generatedCommands'] as List<dynamic>? ?? [];
    final warnsRaw = json['warnings'] as List<dynamic>? ?? [];
    final confsRaw = json['conflicts'] as List<dynamic>? ?? [];

    return ProvisionPreviewResponse(
      template: json['template'] as String? ?? 'CLEAN_SETUP',
      routerVersion: json['routerVersion'] as String? ?? 'V7',
      plannedSteps: stepsRaw.map((e) => PlannedStepModel.fromJson(e as Map<String, dynamic>)).toList(),
      generatedCommands: cmdsRaw.map((e) => GeneratedCommandModel.fromJson(e as Map<String, dynamic>)).toList(),
      warnings: warnsRaw.map((e) => ProvisionWarningModel.fromJson(e as Map<String, dynamic>)).toList(),
      conflicts: confsRaw.map((e) => ProvisionConflictModel.fromJson(e as Map<String, dynamic>)).toList(),
      canProceed: json['canProceed'] as bool? ?? false,
      requiresCleanConfirmation: json['requiresCleanConfirmation'] as bool? ?? false,
      backupRecommended: json['backupRecommended'] as bool? ?? true,
    );
  }
}

class ExecutedStageLogModel {
  final String stage;
  final String? command;
  final String status; // 'SUCCESS' | 'FAILED' | 'SKIPPED'
  final String? error;
  final String timestamp;

  const ExecutedStageLogModel({
    required this.stage,
    this.command,
    required this.status,
    this.error,
    required this.timestamp,
  });

  factory ExecutedStageLogModel.fromJson(Map<String, dynamic> json) {
    return ExecutedStageLogModel(
      stage: json['stage'] as String? ?? '',
      command: json['command'] as String?,
      status: json['status'] as String? ?? 'SUCCESS',
      error: json['error'] as String?,
      timestamp: json['timestamp'] as String? ?? '',
    );
  }
}

class ProvisionVerificationResultModel {
  final bool internetReachable;
  final bool wanConfigured;
  final bool defaultRouteActive;
  final bool hotspotOperational;
  final int pingPacketsReceived;
  final String overallStatus; // 'VERIFIED_READY' | 'PARTIALLY_VERIFIED' | 'VERIFICATION_FAILED'
  final String diagnosticsMessage;

  const ProvisionVerificationResultModel({
    required this.internetReachable,
    required this.wanConfigured,
    required this.defaultRouteActive,
    required this.hotspotOperational,
    this.pingPacketsReceived = 0,
    required this.overallStatus,
    required this.diagnosticsMessage,
  });

  factory ProvisionVerificationResultModel.fromJson(Map<String, dynamic> json) {
    return ProvisionVerificationResultModel(
      internetReachable: json['internetReachable'] as bool? ?? false,
      wanConfigured: json['wanConfigured'] as bool? ?? false,
      defaultRouteActive: json['defaultRouteActive'] as bool? ?? false,
      hotspotOperational: json['hotspotOperational'] as bool? ?? false,
      pingPacketsReceived: json['pingPacketsReceived'] as int? ?? 0,
      overallStatus: json['overallStatus'] as String? ?? 'VERIFICATION_FAILED',
      diagnosticsMessage: json['diagnosticsMessage'] as String? ?? '',
    );
  }
}

class ProvisionApplyResult {
  final bool success;
  final String deviceId;
  final String deviceName;
  final String? backupFilename;
  final List<ExecutedStageLogModel> executedStages;
  final String? failedStage;
  final String? failureReason;
  final String? recoveryInstructions;
  final ProvisionVerificationResultModel verification;

  const ProvisionApplyResult({
    required this.success,
    required this.deviceId,
    required this.deviceName,
    this.backupFilename,
    required this.executedStages,
    this.failedStage,
    this.failureReason,
    this.recoveryInstructions,
    required this.verification,
  });

  factory ProvisionApplyResult.fromJson(Map<String, dynamic> json) {
    final stagesRaw = json['executedStages'] as List<dynamic>? ?? [];
    final verifRaw = json['verification'] as Map<String, dynamic>? ?? {};

    return ProvisionApplyResult(
      success: json['success'] as bool? ?? false,
      deviceId: json['deviceId'] as String? ?? '',
      deviceName: json['deviceName'] as String? ?? '',
      backupFilename: json['backupFilename'] as String?,
      executedStages: stagesRaw.map((e) => ExecutedStageLogModel.fromJson(e as Map<String, dynamic>)).toList(),
      failedStage: json['failedStage'] as String?,
      failureReason: json['failureReason'] as String?,
      recoveryInstructions: json['recoveryInstructions'] as String?,
      verification: ProvisionVerificationResultModel.fromJson(verifRaw),
    );
  }
}
