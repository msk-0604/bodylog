/**
 * In-memory stand-in for react-native-purchases (see jest.setup.ts). Only the calls BODYLOG
 * uses are modelled; tests drive it through `mockPurchases`.
 */
type Listener = (info: unknown) => void;

const pkg = {
  identifier: '$rc_monthly',
  packageType: 'MONTHLY',
  product: {
    identifier: 'jp.bodylog.premium.monthly',
    title: 'BODYLOG Premium',
    price: 350,
    priceString: '¥350',
    currencyCode: 'JPY',
    subscriptionPeriod: 'P1M',
    introPrice: null,
  },
};

export const mockPurchases = {
  configured: null as null | { apiKey: string; appUserID?: string },
  appUserId: '',
  /** error code to throw from the next purchase/restore/getOfferings (PURCHASES_ERROR_CODE) */
  failWith: null as string | null,
  offeringsFail: null as string | null,
  active: false,
  calls: [] as string[],
  listeners: [] as Listener[],
  package: pkg,
  reset() {
    this.configured = null;
    this.appUserId = '';
    this.failWith = null;
    this.offeringsFail = null;
    this.active = false;
    this.calls = [];
    this.listeners = [];
  },
};

const info = () => ({
  entitlements: { active: mockPurchases.active ? { premium: { isActive: true } } : {}, all: {} },
  managementURL: mockPurchases.active ? 'https://apps.apple.com/account/subscriptions' : null,
});

const fail = (code: string | null) => {
  if (code) throw Object.assign(new Error(`rc error ${code}`), { code });
};

const Purchases = {
  configure: (c: { apiKey: string; appUserID?: string }) => {
    mockPurchases.calls.push(`configure:${c.appUserID}`);
    mockPurchases.configured = c;
    mockPurchases.appUserId = c.appUserID ?? '$RCAnonymousID:x';
  },
  setLogLevel: async () => {},
  addCustomerInfoUpdateListener: (l: Listener) => mockPurchases.listeners.push(l),
  getAppUserID: async () => mockPurchases.appUserId,
  logIn: async (id: string) => {
    mockPurchases.calls.push(`logIn:${id}`);
    mockPurchases.appUserId = id;
    mockPurchases.active = false;
    return { customerInfo: info(), created: false };
  },
  logOut: async () => {
    mockPurchases.calls.push('logOut');
    mockPurchases.appUserId = '$RCAnonymousID:x';
    mockPurchases.active = false;
    return info();
  },
  getOfferings: async () => {
    fail(mockPurchases.offeringsFail);
    return { current: { identifier: 'default', monthly: pkg, availablePackages: [pkg] }, all: {} };
  },
  purchasePackage: async (p: { identifier: string }) => {
    mockPurchases.calls.push(`purchase:${p.identifier}:${mockPurchases.appUserId}`);
    const code = mockPurchases.failWith;
    mockPurchases.failWith = null;
    fail(code);
    mockPurchases.active = true;
    return { customerInfo: info(), productIdentifier: pkg.product.identifier };
  },
  restorePurchases: async () => {
    mockPurchases.calls.push('restore');
    const code = mockPurchases.failWith;
    mockPurchases.failWith = null;
    fail(code);
    return info();
  },
  getCustomerInfo: async () => info(),
};

export const purchasesModule = {
  __esModule: true,
  default: Purchases,
  LOG_LEVEL: { WARN: 'WARN', DEBUG: 'DEBUG' },
};
