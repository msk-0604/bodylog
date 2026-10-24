/**
 * In-memory stand-in for expo-notifications used by Jest (see jest.setup.ts).
 * Tests inspect `mockNotifications.scheduled` and set `mockNotifications.permission`.
 */
type Scheduled = { identifier: string; content: unknown; trigger: unknown };
type Presented = { request: { identifier: string; content: { data?: Record<string, unknown> } } };
type ResponseListener = (r: unknown) => void;

export const mockNotifications = {
  scheduled: new Map<string, Scheduled>(),
  permission: { granted: false, canAskAgain: true },
  /** what requestPermissionsAsync answers */
  grantOnRequest: true,
  requests: 0,
  /** last options passed to requestPermissionsAsync */
  lastRequest: null as unknown,
  badge: 0,
  pushToken: 'ExponentPushToken[test-device]',
  pushTokenError: null as Error | null,
  presented: [] as Presented[],
  handler: null as null | { handleNotification: (n: unknown) => Promise<unknown> },
  responseListeners: new Set<ResponseListener>(),
  /** simulates the user tapping a notification with `data` */
  tap(data: Record<string, unknown>) {
    const response = { notification: { request: { identifier: 'n', content: { data } } } };
    this.responseListeners.forEach((l) => l(response));
  },
  reset() {
    this.scheduled.clear();
    this.permission = { granted: false, canAskAgain: true };
    this.grantOnRequest = true;
    this.requests = 0;
    this.lastRequest = null;
    this.badge = 0;
    this.pushToken = 'ExponentPushToken[test-device]';
    this.pushTokenError = null;
    this.presented = [];
    this.responseListeners.clear();
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
  setNotificationHandler: (h: typeof mockNotifications.handler) => {
    mockNotifications.handler = h;
  },
  setNotificationChannelAsync: async () => null,
  getPermissionsAsync: async () => status(),
  requestPermissionsAsync: async (options?: unknown) => {
    mockNotifications.requests += 1;
    mockNotifications.lastRequest = options ?? null;
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
  addNotificationResponseReceivedListener: (l: ResponseListener) => {
    mockNotifications.responseListeners.add(l);
    return { remove: () => mockNotifications.responseListeners.delete(l) };
  },
  getExpoPushTokenAsync: async () => {
    if (mockNotifications.pushTokenError) throw mockNotifications.pushTokenError;
    return { type: 'expo', data: mockNotifications.pushToken };
  },
  setBadgeCountAsync: async (n: number) => {
    mockNotifications.badge = n;
    return true;
  },
  getBadgeCountAsync: async () => mockNotifications.badge,
  getPresentedNotificationsAsync: async () => mockNotifications.presented,
  dismissNotificationAsync: async (id: string) => {
    mockNotifications.presented = mockNotifications.presented.filter(
      (p) => p.request.identifier !== id,
    );
  },
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => {},
};
