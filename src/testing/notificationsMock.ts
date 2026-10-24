/**
 * In-memory stand-in for expo-notifications used by Jest (see jest.setup.ts).
 * Tests inspect `mockNotifications.scheduled` and set `mockNotifications.permission`.
 */
type Scheduled = { identifier: string; content: unknown; trigger: unknown };

export const mockNotifications = {
  scheduled: new Map<string, Scheduled>(),
  permission: { granted: false, canAskAgain: true },
  /** what requestPermissionsAsync answers */
  grantOnRequest: true,
  requests: 0,
  reset() {
    this.scheduled.clear();
    this.permission = { granted: false, canAskAgain: true };
    this.grantOnRequest = true;
    this.requests = 0;
  },
};

const status = () => ({
  granted: mockNotifications.permission.granted,
  canAskAgain: mockNotifications.permission.canAskAgain,
  status: mockNotifications.permission.granted ? 'granted' : 'denied',
  expires: 'never',
});

export const notificationsModule = {
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => null,
  getPermissionsAsync: async () => status(),
  requestPermissionsAsync: async () => {
    mockNotifications.requests += 1;
    mockNotifications.permission = {
      granted: mockNotifications.grantOnRequest,
      canAskAgain: false,
    };
    return status();
  },
  getAllScheduledNotificationsAsync: async () => [...mockNotifications.scheduled.values()],
  cancelScheduledNotificationAsync: async (id: string) => {
    mockNotifications.scheduled.delete(id);
  },
  scheduleNotificationAsync: async (req: Scheduled) => {
    mockNotifications.scheduled.set(req.identifier, req);
    return req.identifier;
  },
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => {},
};
