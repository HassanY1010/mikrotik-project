import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';

const sortableArrayKeys = {
  'interfaces',
  'ethernet',
  'bridges',
  'bridgePorts',
  'ipAddresses',
  'pools',
  'dhcpServers',
  'hotspots',
};

const volatileKeys = {
  'uptime',
  'free-memory',
  'cpu-load',
  'rx-byte',
  'tx-byte',
  'free-hdd-space',
  'write-sect-total',
  'write-sect-since-reboot',
};

int binaryCompare(dynamic a, dynamic b) {
  final strA = a?.toString() ?? '';
  final strB = b?.toString() ?? '';
  return strA.compareTo(strB);
}

String canonicalizeJson(dynamic obj, [String? parentKey]) {
  if (obj == null || (obj is! Map && obj is! List)) {
    return jsonEncode(obj);
  }

  if (obj is List) {
    final shouldSort = parentKey == null || sortableArrayKeys.contains(parentKey);
    final items = List.from(obj);

    if (shouldSort) {
      items.sort((a, b) {
        String getStableKey(dynamic item) {
          if (item == null || item is! Map) return item.toString();
          return (item['name'] ?? item['address'] ?? item['.id'] ?? item['mac-address'] ?? '').toString();
        }

        final keyA = getStableKey(a);
        final keyB = getStableKey(b);
        final primaryCmp = binaryCompare(keyA, keyB);
        if (primaryCmp != 0) return primaryCmp;

        return binaryCompare(canonicalizeJson(a), canonicalizeJson(b));
      });
    }

    final serializedItems = items.map((item) => canonicalizeJson(item, parentKey)).join(',');
    return '[$serializedItems]';
  }

  if (obj is Map) {
    final sortedKeys = obj.keys.map((k) => k.toString()).toList()..sort(binaryCompare);
    final pairs = <String>[];

    for (final key in sortedKeys) {
      if (!volatileKeys.contains(key)) {
        pairs.add('${jsonEncode(key)}:${canonicalizeJson(obj[key], key)}');
      }
    }
    return '{${pairs.join(',')}}';
  }

  return jsonEncode(obj);
}

void main(List<String> args) {
  if (args.isEmpty) {
    stderr.writeln('Usage: dart_parity_test.dart <json-file-path>');
    exit(1);
  }

  final file = File(args[0]);
  if (!file.existsSync()) {
    stderr.writeln('Error: File not found: ${args[0]}');
    exit(1);
  }

  final jsonString = file.readAsStringSync(encoding: utf8);
  final dynamic parsed = jsonDecode(jsonString);

  final canonical = canonicalizeJson(parsed);
  final hash = sha256.convert(utf8.encode(canonical)).toString();

  stdout.write(hash);
}
