const { withPodfile } = require('@expo/config-plugins');

const marker = '# Frume: align every Pod target with the app deployment target.';
const reactNativePostInstall = '    react_native_post_install(';
const reactNativePostInstallEnd = '\n    )';

function patchPodfileDeploymentTargets(contents) {
  if (contents.includes(marker)) {
    return contents;
  }

  const callStart = contents.indexOf(reactNativePostInstall);
  const callEnd = contents.indexOf(reactNativePostInstallEnd, callStart);
  if (callStart === -1 || callEnd === -1) {
    throw new Error(
      'Unable to align Pod deployment targets: react_native_post_install anchor was not found.',
    );
  }

  const insertionPoint = callEnd + reactNativePostInstallEnd.length;
  const override = `

${marker}
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = podfile_properties['ios.deploymentTarget'] || '15.1'
      end
    end`;

  return `${contents.slice(0, insertionPoint)}${override}${contents.slice(insertionPoint)}`;
}

function withIosPodDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = patchPodfileDeploymentTargets(
      podfileConfig.modResults.contents,
    );
    return podfileConfig;
  });
}

module.exports = withIosPodDeploymentTarget;
module.exports.patchPodfileDeploymentTargets = patchPodfileDeploymentTargets;
