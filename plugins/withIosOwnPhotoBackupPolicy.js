const { withAppDelegate } = require('@expo/config-plugins');

const launchMarker =
  '    // Frume: keep durable local photographs out of iCloud Backup.\n' +
  '    prepareNonBackupPhotoDirectories()';
const launchAnchor = '    bindReactNativeFactory(factory)';
const classEndAnchor = '\n}\n\nclass ReactNativeDelegate';
const methodMarker = '  private func prepareNonBackupPhotoDirectories() {';

const backupPolicyMethod = `

  /**
   * Own photographs must survive cache pressure but must not enter iCloud
   * Backup. Setting the resource value on the containing directory covers
   * photographs copied into it later by expo-file-system.
   */
  private func prepareNonBackupPhotoDirectories() {
    guard let documents = FileManager.default.urls(
      for: .documentDirectory,
      in: .userDomainMask
    ).first else {
      return
    }

    for name in ["frume-own-photos", "frume-saved-puzzle"] {
      var directory = documents.appendingPathComponent(name, isDirectory: true)
      do {
        try FileManager.default.createDirectory(
          at: directory,
          withIntermediateDirectories: true
        )
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try directory.setResourceValues(resourceValues)
      } catch {
        NSLog("Frume could not apply its local-photo backup policy: %@", String(describing: error))
      }
    }
  }
`;

function patchAppDelegateBackupPolicy(contents) {
  let patched = contents;
  if (!patched.includes('import Foundation')) {
    const importAnchor = 'import Expo';
    if (!patched.includes(importAnchor)) {
      throw new Error(
        'Unable to apply the iOS backup policy: Swift import anchor was not found.',
      );
    }
    patched = patched.replace(importAnchor, `${importAnchor}\nimport Foundation`);
  }

  if (!patched.includes(launchMarker)) {
    if (!patched.includes(launchAnchor)) {
      throw new Error(
        'Unable to apply the iOS backup policy: launch anchor was not found.',
      );
    }
    patched = patched.replace(
      launchAnchor,
      `${launchAnchor}\n${launchMarker}`,
    );
  }

  if (!patched.includes(methodMarker)) {
    if (!patched.includes(classEndAnchor)) {
      throw new Error(
        'Unable to apply the iOS backup policy: AppDelegate class anchor was not found.',
      );
    }
    patched = patched.replace(
      classEndAnchor,
      `${backupPolicyMethod}${classEndAnchor}`,
    );
  }

  return patched;
}

function withIosOwnPhotoBackupPolicy(config) {
  return withAppDelegate(config, (appDelegateConfig) => {
    if (appDelegateConfig.modResults.language !== 'swift') {
      throw new Error('Frume requires a Swift AppDelegate for its backup policy.');
    }
    appDelegateConfig.modResults.contents = patchAppDelegateBackupPolicy(
      appDelegateConfig.modResults.contents,
    );
    return appDelegateConfig;
  });
}

module.exports = withIosOwnPhotoBackupPolicy;
module.exports.patchAppDelegateBackupPolicy = patchAppDelegateBackupPolicy;
