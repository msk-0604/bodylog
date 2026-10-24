// Deterministic, Node-backed replacements for native modules used in unit tests.
jest.mock('expo-crypto', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  randomUUID: () => require('crypto').randomUUID(),
}));

jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock(
  'expo-notifications',
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./src/testing/notificationsMock').notificationsModule,
);
