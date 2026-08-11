import { describe, expect, it } from 'vitest';

const {
  patchPodfileDeploymentTargets,
} = require('../../plugins/withIosPodDeploymentTarget');

const podfile = `target 'Frume' do
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
  end
end
`;

describe('withIosPodDeploymentTarget', () => {
  it('raises every generated pod target to the app deployment target', () => {
    const patched = patchPodfileDeploymentTargets(podfile);

    expect(patched).toContain(
      "config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = podfile_properties['ios.deploymentTarget'] || '15.1'",
    );
    expect(patchPodfileDeploymentTargets(patched)).toBe(patched);
  });

  it('fails loudly when the Expo Podfile template no longer has the anchor', () => {
    expect(() => patchPodfileDeploymentTargets("target 'Frume' do\nend\n")).toThrow(
      /react_native_post_install/,
    );
  });
});
