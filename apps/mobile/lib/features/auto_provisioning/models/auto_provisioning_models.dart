// Data models for MikroTik Auto Provisioning Engine (6-Screen Workflow).

class AutoProvisionCapabilities {
  final String osFamily;
  final String version;
  final int majorVersion;
  final int minorVersion;
  final String boardName;
  final String model;
  final String architecture;
  final bool supportsHotspot;
  final String wirelessStack;
  final bool supportsWireless;
  final bool supportsWifi;
  final String ntpStack;
  final bool supportsNtpServersTable;
  final bool supportsQueueTypes;
  final bool supportsScheduler;
  final bool supportsNetwatch;
  final bool supportsRscExport;
  final bool supportsBinaryBackup;
  final bool supportsRestApi;
  final bool supportsSafeModeInCurrentSession;
  final String safeModeReason;
  final bool hasEnoughDiskForBackup;
  final int freeHddBytes;
  final List<String> ethernetPorts;
  final List<String> sfpPorts;
  final int totalPhysicalPorts;
  final List<String> wirelessInterfaceNames;
  final List<String> wifiInterfaceNames;
  final String compatibilityStatus;
  final String compatibilitySummary;
  final List<String> warnings;

  const AutoProvisionCapabilities({
    required this.osFamily,
    required this.version,
    required this.majorVersion,
    required this.minorVersion,
    required this.boardName,
    required this.model,
    required this.architecture,
    required this.supportsHotspot,
    required this.wirelessStack,
    required this.supportsWireless,
    required this.supportsWifi,
    required this.ntpStack,
    required this.supportsNtpServersTable,
    required this.supportsQueueTypes,
    required this.supportsScheduler,
    required this.supportsNetwatch,
    required this.supportsRscExport,
    required this.supportsBinaryBackup,
    required this.supportsRestApi,
    required this.supportsSafeModeInCurrentSession,
    required this.safeModeReason,
    required this.hasEnoughDiskForBackup,
    required this.freeHddBytes,
    required this.ethernetPorts,
    required this.sfpPorts,
    required this.totalPhysicalPorts,
    required this.wirelessInterfaceNames,
    required this.wifiInterfaceNames,
    required this.compatibilityStatus,
    required this.compatibilitySummary,
    required this.warnings,
  });

  factory AutoProvisionCapabilities.fromJson(Map<String, dynamic> json) {
    final wl = (json['wirelessInterfaces'] as List? ?? [])
        .map((e) => (e is Map ? e['name']?.toString() : e?.toString()) ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
    final wf = (json['wifiInterfaces'] as List? ?? [])
        .map((e) => (e is Map ? e['name']?.toString() : e?.toString()) ?? '')
        .where((s) => s.isNotEmpty)
        .toList();

    return AutoProvisionCapabilities(
      osFamily: json['osFamily']?.toString() ?? 'UNKNOWN',
      version: json['version']?.toString() ?? '',
      majorVersion: (json['majorVersion'] as num?)?.toInt() ?? 0,
      minorVersion: (json['minorVersion'] as num?)?.toInt() ?? 0,
      boardName: json['boardName']?.toString() ?? '',
      model: json['model']?.toString() ?? '',
      architecture: json['architecture']?.toString() ?? '',
      supportsHotspot: json['supportsHotspot'] == true,
      wirelessStack: json['wirelessStack']?.toString() ?? 'NONE',
      supportsWireless: json['supportsWireless'] == true,
      supportsWifi: json['supportsWifi'] == true,
      ntpStack: json['ntpStack']?.toString() ?? 'NONE',
      supportsNtpServersTable: json['supportsNtpServersTable'] == true,
      supportsQueueTypes: json['supportsQueueTypes'] == true,
      supportsScheduler: json['supportsScheduler'] == true,
      supportsNetwatch: json['supportsNetwatch'] == true,
      supportsRscExport: json['supportsRscExport'] != false,
      supportsBinaryBackup: json['supportsBinaryBackup'] != false,
      supportsRestApi: json['supportsRestApi'] == true,
      supportsSafeModeInCurrentSession: json['supportsSafeModeInCurrentSession'] == true,
      safeModeReason: json['safeModeReason']?.toString() ?? '',
      hasEnoughDiskForBackup: json['hasEnoughDiskForBackup'] != false,
      freeHddBytes: (json['freeHddBytes'] as num?)?.toInt() ?? 0,
      ethernetPorts: List<String>.from(json['ethernetPorts'] ?? const []),
      sfpPorts: List<String>.from(json['sfpPorts'] ?? const []),
      totalPhysicalPorts: (json['totalPhysicalPorts'] as num?)?.toInt() ?? 0,
      wirelessInterfaceNames: wl,
      wifiInterfaceNames: wf,
      compatibilityStatus: json['compatibilityStatus']?.toString() ?? 'COMPATIBLE',
      compatibilitySummary: json['compatibilitySummary']?.toString() ?? '',
      warnings: List<String>.from(json['warnings'] ?? const []),
    );
  }

  bool get hasAnyWireless => supportsWifi || supportsWireless;
  List<String> get allWirelessNames =>
      wifiInterfaceNames.isNotEmpty ? wifiInterfaceNames : wirelessInterfaceNames;
}

class DiscoveredInterfaceAssessment {
  final String name;
  final String type;
  final bool enabled;
  final bool running;
  final bool hasIp;
  final List<String> ipAddresses;
  final bool bridged;
  final String? bridgeName;
  final String role;
  final String confidence;
  final bool isWanCandidate;
  final bool isLanCandidate;
  final bool isManagementPath;
  final bool hasExistingConfig;
  final List<String> reasons;

  const DiscoveredInterfaceAssessment({
    required this.name,
    required this.type,
    required this.enabled,
    required this.running,
    required this.hasIp,
    required this.ipAddresses,
    required this.bridged,
    this.bridgeName,
    required this.role,
    required this.confidence,
    required this.isWanCandidate,
    required this.isLanCandidate,
    required this.isManagementPath,
    required this.hasExistingConfig,
    required this.reasons,
  });

  factory DiscoveredInterfaceAssessment.fromJson(Map<String, dynamic> json) {
    return DiscoveredInterfaceAssessment(
      name: json['name']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      enabled: json['enabled'] != false,
      running: json['running'] == true,
      hasIp: json['hasIp'] == true,
      ipAddresses: List<String>.from(json['ipAddresses'] ?? const []),
      bridged: json['bridged'] == true,
      bridgeName: json['bridgeName']?.toString(),
      role: json['role']?.toString() ?? 'UNUSED',
      confidence: json['confidence']?.toString() ?? 'AMBIGUOUS',
      isWanCandidate: json['isWanCandidate'] == true,
      isLanCandidate: json['isLanCandidate'] == true,
      isManagementPath: json['isManagementPath'] == true,
      hasExistingConfig: json['hasExistingConfig'] == true,
      reasons: List<String>.from(json['reasons'] ?? const []),
    );
  }
}

class AutoProvisionDiscoveryReport {
  final String deviceId;
  final String deviceName;
  final String host;
  final String identity;
  final String uptime;
  final int freeMemoryBytes;
  final int totalMemoryBytes;
  final int freeHddBytes;
  final int totalHddBytes;
  final AutoProvisionCapabilities capabilities;
  final List<DiscoveredInterfaceAssessment> interfacesAssessment;
  final bool wanRoleAmbiguous;
  final String? suggestedWanInterface;
  final List<String> suggestedLanInterfaces;
  final String? managementInterface;
  final String snapshotHash;
  final String discoveredAt;
  final List<Map<String, dynamic>> bridges;
  final List<Map<String, dynamic>> hotspotServers;
  final List<Map<String, dynamic>> ipAddresses;

  const AutoProvisionDiscoveryReport({
    required this.deviceId,
    required this.deviceName,
    required this.host,
    required this.identity,
    required this.uptime,
    required this.freeMemoryBytes,
    required this.totalMemoryBytes,
    required this.freeHddBytes,
    required this.totalHddBytes,
    required this.capabilities,
    required this.interfacesAssessment,
    required this.wanRoleAmbiguous,
    this.suggestedWanInterface,
    required this.suggestedLanInterfaces,
    this.managementInterface,
    required this.snapshotHash,
    required this.discoveredAt,
    required this.bridges,
    required this.hotspotServers,
    required this.ipAddresses,
  });

  factory AutoProvisionDiscoveryReport.fromJson(Map<String, dynamic> json) {
    final dev = (json['device'] as Map<String, dynamic>?) ?? const {};
    return AutoProvisionDiscoveryReport(
      deviceId: dev['deviceId']?.toString() ?? '',
      deviceName: dev['deviceName']?.toString() ?? '',
      host: dev['host']?.toString() ?? '',
      identity: dev['identity']?.toString() ?? '',
      uptime: dev['uptime']?.toString() ?? '0s',
      freeMemoryBytes: (dev['freeMemoryBytes'] as num?)?.toInt() ?? 0,
      totalMemoryBytes: (dev['totalMemoryBytes'] as num?)?.toInt() ?? 0,
      freeHddBytes: (dev['freeHddBytes'] as num?)?.toInt() ?? 0,
      totalHddBytes: (dev['totalHddBytes'] as num?)?.toInt() ?? 0,
      capabilities: AutoProvisionCapabilities.fromJson(
        (json['capabilities'] as Map<String, dynamic>?) ?? const {},
      ),
      interfacesAssessment: (json['interfacesAssessment'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(DiscoveredInterfaceAssessment.fromJson)
          .toList(),
      wanRoleAmbiguous: json['wanRoleAmbiguous'] == true,
      suggestedWanInterface: json['suggestedWanInterface']?.toString(),
      suggestedLanInterfaces: List<String>.from(json['suggestedLanInterfaces'] ?? const []),
      managementInterface: json['managementInterface']?.toString(),
      snapshotHash: json['snapshotHash']?.toString() ?? '',
      discoveredAt: json['discoveredAt']?.toString() ?? '',
      bridges: List<Map<String, dynamic>>.from(
        (json['bridges'] as List? ?? []).whereType<Map<String, dynamic>>(),
      ),
      hotspotServers: List<Map<String, dynamic>>.from(
        (json['hotspotServers'] as List? ?? []).whereType<Map<String, dynamic>>(),
      ),
      ipAddresses: List<Map<String, dynamic>>.from(
        (json['ipAddresses'] as List? ?? []).whereType<Map<String, dynamic>>(),
      ),
    );
  }
}

class PlannedProvisionStageModel {
  final int stepOrder;
  final String stage;
  final String title;
  final String description;
  final String status;
  final String? skipReason;
  final String expectedResult;
  final String riskLevel;
  final List<String> addedItems;
  final List<String> changedItems;
  final List<String> skippedItems;
  final List<String> commandPreviews;

  const PlannedProvisionStageModel({
    required this.stepOrder,
    required this.stage,
    required this.title,
    required this.description,
    required this.status,
    this.skipReason,
    required this.expectedResult,
    required this.riskLevel,
    required this.addedItems,
    required this.changedItems,
    required this.skippedItems,
    required this.commandPreviews,
  });

  factory PlannedProvisionStageModel.fromJson(Map<String, dynamic> json) {
    final diff = (json['diffSummary'] as Map<String, dynamic>?) ?? const {};
    final cmds = (json['commands'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map((c) => c['cliPreview']?.toString() ?? c['commandMasked']?.toString() ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
    return PlannedProvisionStageModel(
      stepOrder: (json['stepOrder'] as num?)?.toInt() ?? 0,
      stage: json['stage']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PLANNED',
      skipReason: json['skipReason']?.toString(),
      expectedResult: json['expectedResult']?.toString() ?? '',
      riskLevel: json['riskLevel']?.toString() ?? 'LOW',
      addedItems: List<String>.from(diff['addedItems'] ?? const []),
      changedItems: List<String>.from(diff['changedItems'] ?? const []),
      skippedItems: List<String>.from(diff['skippedItems'] ?? const []),
      commandPreviews: cmds,
    );
  }
}

class AutoProvisionPlanPreview {
  final String planId;
  final String planHash;
  final String osFamily;
  final String rosVersion;
  final bool canProceed;
  final bool wanConfirmationRequired;
  final List<String> wanConfirmationReasons;
  final bool managementSevered;
  final List<String> blockedReasons;
  final List<String> warnings;
  final List<String> currentSettings;
  final List<String> newSettings;
  final List<String> riskNotes;
  final List<PlannedProvisionStageModel> stages;
  final int totalPlannedCommands;
  final Map<String, dynamic>? planToken;

  const AutoProvisionPlanPreview({
    required this.planId,
    required this.planHash,
    required this.osFamily,
    required this.rosVersion,
    required this.canProceed,
    required this.wanConfirmationRequired,
    required this.wanConfirmationReasons,
    required this.managementSevered,
    required this.blockedReasons,
    required this.warnings,
    required this.currentSettings,
    required this.newSettings,
    required this.riskNotes,
    required this.stages,
    required this.totalPlannedCommands,
    this.planToken,
  });

  factory AutoProvisionPlanPreview.fromJson(Map<String, dynamic> json) {
    final diff = (json['diffOverview'] as Map<String, dynamic>?) ?? const {};
    final mgmt = (json['managementSafety'] as Map<String, dynamic>?) ?? const {};
    final rawWarnings = (json['warnings'] as List? ?? [])
        .map((w) => w is Map ? (w['message']?.toString() ?? '') : w.toString())
        .where((s) => s.isNotEmpty)
        .toList();

    return AutoProvisionPlanPreview(
      planId: json['planId']?.toString() ?? '',
      planHash: json['planHash']?.toString() ?? '',
      osFamily: json['osFamily']?.toString() ?? 'UNKNOWN',
      rosVersion: json['rosVersion']?.toString() ?? '',
      canProceed: json['canProceed'] == true,
      wanConfirmationRequired: json['wanConfirmationRequired'] == true,
      wanConfirmationReasons: List<String>.from(json['wanConfirmationReasons'] ?? const []),
      managementSevered: mgmt['isSevered'] == true,
      blockedReasons: List<String>.from(json['blockedReasons'] ?? const []),
      warnings: rawWarnings,
      currentSettings: List<String>.from(diff['currentSettings'] ?? const []),
      newSettings: List<String>.from(diff['newSettings'] ?? const []),
      riskNotes: List<String>.from(diff['riskNotes'] ?? const []),
      stages: (json['stages'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PlannedProvisionStageModel.fromJson)
          .toList(),
      totalPlannedCommands: (json['totalPlannedCommands'] as num?)?.toInt() ?? 0,
      planToken: json['planToken'] as Map<String, dynamic>?,
    );
  }
}

class AutoProvisionBackupItem {
  final String id;
  final String backupType;
  final String fileName;
  final String routerFileName;
  final int fileSizeBytes;
  final String status;
  final String? routerModel;
  final String? routerOsVersion;
  final String? portabilityNotice;
  final String createdAt;

  const AutoProvisionBackupItem({
    required this.id,
    required this.backupType,
    required this.fileName,
    required this.routerFileName,
    required this.fileSizeBytes,
    required this.status,
    this.routerModel,
    this.routerOsVersion,
    this.portabilityNotice,
    required this.createdAt,
  });

  factory AutoProvisionBackupItem.fromJson(Map<String, dynamic> json) {
    return AutoProvisionBackupItem(
      id: json['id']?.toString() ?? '',
      backupType: json['backupType']?.toString() ?? 'BINARY',
      fileName: json['fileName']?.toString() ?? '',
      routerFileName: json['routerFileName']?.toString() ?? '',
      fileSizeBytes: (json['fileSizeBytes'] as num?)?.toInt() ?? 0,
      status: json['status']?.toString() ?? 'READY',
      routerModel: json['routerModel']?.toString(),
      routerOsVersion: json['routerOsVersion']?.toString(),
      portabilityNotice: json['portabilityNotice']?.toString(),
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}

class AutoProvisionStepLog {
  final int stepOrder;
  final String stage;
  final String title;
  final String status;
  final String? errorMessage;

  const AutoProvisionStepLog({
    required this.stepOrder,
    required this.stage,
    required this.title,
    required this.status,
    this.errorMessage,
  });

  factory AutoProvisionStepLog.fromJson(Map<String, dynamic> json) {
    return AutoProvisionStepLog(
      stepOrder: (json['stepOrder'] as num?)?.toInt() ?? 0,
      stage: json['stage']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
      errorMessage: json['errorMessage']?.toString(),
    );
  }
}

class AutoProvisionCommandLogItem {
  final int commandOrder;
  final String stage;
  final String description;
  final String commandMasked;
  final String status;
  final int? durationMs;
  final String? errorMessage;

  const AutoProvisionCommandLogItem({
    required this.commandOrder,
    required this.stage,
    required this.description,
    required this.commandMasked,
    required this.status,
    this.durationMs,
    this.errorMessage,
  });

  factory AutoProvisionCommandLogItem.fromJson(Map<String, dynamic> json) {
    return AutoProvisionCommandLogItem(
      commandOrder: (json['commandOrder'] as num?)?.toInt() ?? 0,
      stage: json['stage']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      commandMasked: json['commandMasked']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
      durationMs: (json['durationMs'] as num?)?.toInt(),
      errorMessage: json['errorMessage']?.toString(),
    );
  }
}

class AutoProvisionOperationModel {
  final String id;
  final String deviceId;
  final String status;
  final String template;
  final int progressPercent;
  final int totalSteps;
  final int totalCommands;
  final int succeededCommands;
  final int failedCommands;
  final int skippedCommands;
  final String? preBackupId;
  final String? rscBackupId;
  final String? failureReason;
  final Map<String, dynamic>? verificationResult;
  final int? durationMs;
  final String? createdAt;
  final List<AutoProvisionStepLog> steps;
  final List<AutoProvisionCommandLogItem> commandLogs;
  final List<AutoProvisionBackupItem> backups;

  const AutoProvisionOperationModel({
    required this.id,
    required this.deviceId,
    required this.status,
    required this.template,
    required this.progressPercent,
    required this.totalSteps,
    required this.totalCommands,
    required this.succeededCommands,
    required this.failedCommands,
    required this.skippedCommands,
    this.preBackupId,
    this.rscBackupId,
    this.failureReason,
    this.verificationResult,
    this.durationMs,
    this.createdAt,
    required this.steps,
    required this.commandLogs,
    required this.backups,
  });

  factory AutoProvisionOperationModel.fromJson(Map<String, dynamic> json) {
    return AutoProvisionOperationModel(
      id: json['id']?.toString() ?? json['operationId']?.toString() ?? '',
      deviceId: json['deviceId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
      template: json['template']?.toString() ?? 'CLEAN_SETUP',
      progressPercent: (json['progressPercent'] as num?)?.toInt() ?? 0,
      totalSteps: (json['totalSteps'] as num?)?.toInt() ?? 0,
      totalCommands: (json['totalCommands'] as num?)?.toInt() ?? 0,
      succeededCommands: (json['succeededCommands'] as num?)?.toInt() ?? 0,
      failedCommands: (json['failedCommands'] as num?)?.toInt() ?? 0,
      skippedCommands: (json['skippedCommands'] as num?)?.toInt() ?? 0,
      preBackupId: json['preBackupId']?.toString(),
      rscBackupId: json['rscBackupId']?.toString(),
      failureReason: json['failureReason']?.toString(),
      verificationResult: json['verificationResult'] as Map<String, dynamic>?,
      durationMs: (json['durationMs'] as num?)?.toInt(),
      createdAt: json['createdAt']?.toString(),
      steps: (json['steps'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(AutoProvisionStepLog.fromJson)
          .toList(),
      commandLogs: (json['commandLogs'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(AutoProvisionCommandLogItem.fromJson)
          .toList(),
      backups: (json['backups'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(AutoProvisionBackupItem.fromJson)
          .toList(),
    );
  }

  bool get isTerminal =>
      status == 'COMPLETED' ||
      status == 'FAILED' ||
      status == 'CANCELLED' ||
      status == 'ROLLED_BACK';
}
