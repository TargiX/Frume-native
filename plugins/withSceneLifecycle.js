const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * iOS 27 SDK (Xcode 27) hard-requires UIScene lifecycle at launch — binaries
 * without UIApplicationSceneManifest trap in
 * _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption. Expo 54 /
 * RN 0.81 prebuild still emits an AppDelegate/window lifecycle, so Frume
 * adopts scenes here until upstream lands scene support.
 */

const sceneDelegateSource = `import React
import UIKit

public class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  public var window: UIWindow?

  public func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: nil
    )

    for context in connectionOptions.urlContexts {
      forwardOpenURL(context)
    }
    for activity in connectionOptions.userActivities {
      forwardUserActivity(activity)
    }
  }

  public func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      forwardOpenURL(context)
    }
  }

  public func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    forwardUserActivity(userActivity)
  }

  private func forwardOpenURL(_ context: UIOpenURLContext) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let source = context.options.sourceApplication {
      options[.sourceApplication] = source
    }
    if let annotation = context.options.annotation {
      options[.annotation] = annotation
    }
    if context.options.openInPlace {
      options[.openInPlace] = true
    }
    RCTLinkingManager.application(UIApplication.shared, open: context.url, options: options)
  }

  private func forwardUserActivity(_ userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity
    ) { _ in }
  }
}
`;

const windowPropertyBlock = '  var window: UIWindow?\n\n';
const windowBootBlock = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

`;

function withSceneManifest(config) {
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return plistConfig;
  });
}

function withSceneDelegateSource(config) {
  return withDangerousMod(config, [
    'ios',
    async (dangerousConfig) => {
      const targetDir = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        'Frume',
      );
      fs.writeFileSync(
        path.join(targetDir, 'SceneDelegate.swift'),
        sceneDelegateSource,
      );
      return dangerousConfig;
    },
  ]);
}

function withSceneDelegateTarget(config) {
  return withXcodeProject(config, (projectConfig) => {
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: 'Frume/SceneDelegate.swift',
      groupName: 'Frume',
      project: projectConfig.modResults,
    });
    return projectConfig;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (appDelegateConfig) => {
    if (appDelegateConfig.modResults.language !== 'swift') {
      throw new Error('Frume requires a Swift AppDelegate for scene lifecycle.');
    }
    let contents = appDelegateConfig.modResults.contents;
    if (contents.includes(windowBootBlock)) {
      contents = contents.replace(windowBootBlock, '');
    } else if (
      contents.includes('UIWindow(') ||
      contents.includes('startReactNative')
    ) {
      throw new Error(
        'Unable to adopt scene lifecycle: AppDelegate window boot block was not found.',
      );
    }
    contents = contents.replace(windowPropertyBlock, '');
    appDelegateConfig.modResults.contents = contents;
    return appDelegateConfig;
  });
}

function withSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneDelegateSource(config);
  config = withSceneDelegateTarget(config);
  return withSceneAppDelegate(config);
}

module.exports = withSceneLifecycle;
