import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json. Android push (FCM via Expo) needs the Firebase config file in the build.
 * It is NOT committed: on EAS it comes from the file environment variable GOOGLE_SERVICES_JSON
 * (docs/USER_ACTIONS.md). Without it the app builds, but Android can't receive pushes.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
