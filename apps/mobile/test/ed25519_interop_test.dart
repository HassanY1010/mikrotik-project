import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:cryptography/cryptography.dart';

List<int> hexToBytes(String hex) {
  final result = <int>[];
  for (int i = 0; i < hex.length; i += 2) {
    result.add(int.parse(hex.substring(i, i + 2), radix: 16));
  }
  return result;
}

void main() {
  test('Dart cryptography verifies Node.js Ed25519 signature', () async {
    const rawPubHex = '16e773cd27757aa631d5469942a98ae97280f45fef132d896fa2b9d8175c7251';
    const sigHex = 'cb22c916a46ce313cdf930b5182835dc722b0dac7d85c18272bac94e38f9e2913029858468bacca7c60826999e17d5368a71427b81a52582d70af643d2510504';
    const msg = 'SudaFi-Plan-v1:tenant-1:dev-1';

    final algorithm = Ed25519();
    final pubKey = SimplePublicKey(hexToBytes(rawPubHex), type: KeyPairType.ed25519);
    final signature = Signature(hexToBytes(sigHex), publicKey: pubKey);

    final isValid = await algorithm.verify(
      utf8.encode(msg),
      signature: signature,
    );

    expect(isValid, true);
  });
}
