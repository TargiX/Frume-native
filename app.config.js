const DEFAULT_IOS_BUILD_NUMBER = '2';
const configuredIosBuildNumber = process.env.FRUME_BUILD_NUMBER;
const iosBuildNumber =
  configuredIosBuildNumber === undefined
    ? DEFAULT_IOS_BUILD_NUMBER
    : configuredIosBuildNumber.trim();

if (!/^[1-9][0-9]*$/.test(iosBuildNumber)) {
  throw new Error(
    'FRUME_BUILD_NUMBER must be a positive integer when it is provided.',
  );
}

module.exports = {
  expo: {
    name: 'Frume',
    slug: 'frume',
    version: '1.0.0',
    orientation: 'default',
    icon: './assets/frume-icon.png',
    scheme: 'frume',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
      image: './assets/frume-adaptive-foreground.png',
      resizeMode: 'contain',
      backgroundColor: '#03043f',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.targix.frumenative',
      buildNumber: iosBuildNumber,
      config: {
        // Frume uses platform-provided HTTPS/store encryption and does not
        // implement a non-exempt cryptographic algorithm.
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.targix.frume',
      versionCode: 1,
      edgeToEdgeEnabled: true,
      // Puzzle state and RevenueCat's anonymous identifier are local app data;
      // recovery is explicit in-app, not through Android cloud backup.
      allowBackup: false,
      // expo-file-system contributes legacy broad storage permissions that
      // Frume does not use. The base Expo manifest also declares the debug
      // overlay permission, which is not needed by a store build.
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      adaptiveIcon: {
        foregroundImage: './assets/frume-adaptive-foreground.png',
        // A flat alpha mask derived from the Frume mark for Android themed
        // icons. The textured full-color foreground is intentionally not used.
        monochromeImage: './assets/android-icon-monochrome.png',
        backgroundColor: '#03043f',
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      'expo-font',
      'expo-asset',
      [
        'expo-audio',
        {
          microphonePermission: false,
          recordAudioAndroid: false,
        },
      ],
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '16.0',
          },
        },
      ],
    ],
  },
};
