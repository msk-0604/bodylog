/**
 * Phase 6 flows in local mode with the mock store: paywall shows the STORE's price and terms,
 * purchase unlocks Premium-only graphs/stats, cancellation/errors/offline are handled, restore.
 * Real App Store / Google Play purchases are NOT exercised here (see docs/TASKS.md).
 */
import NetInfo from '@react-native-community/netinfo';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { resetSessionForTests } from '@/features/auth/session';
import { resetPurchaseFlowForTests } from '@/features/premium/actions';
import { mockBillingState } from '@/features/premium/billing/mock';
import { resetPremiumForTests } from '@/features/premium/entitlement';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));

const APP_DIR = './src/app';
jest.setTimeout(30_000);

let alert: jest.SpyInstance;
beforeEach(async () => {
  resetSessionForTests();
  resetPurchaseFlowForTests();
  resetPremiumForTests();
  mockBillingState.reset();
  mockDb = await createTestDb();
  alert = jest.spyOn(Alert, 'alert');
});
afterEach(() => {
  alert.mockRestore();
  mockDb?.close();
  mockDb = null;
});

async function start() {
  const r = await renderRouter(APP_DIR, { initialUrl: '/' });
  await fireEvent.changeText(await screen.findByTestId('height-input'), '170');
  await fireEvent.changeText(screen.getByTestId('current-weight-input'), '70');
  await fireEvent.changeText(screen.getByTestId('target-weight-input'), '65');
  await fireEvent.press(screen.getByTestId('onboarding-next'));
  await fireEvent.changeText(await screen.findByTestId('goal-kcal-input'), '1800');
  await fireEvent.press(screen.getByTestId('terms-checkbox'));
  await fireEvent.press(screen.getByTestId('onboarding-finish'));
  await screen.findByTestId('home-screen', {}, { timeout: 5000 });
  return r;
}

async function openPaywall() {
  await fireEvent.press(screen.getByTestId('tab-mypage'));
  await fireEvent.press(await screen.findByTestId('row-premium'));
  await screen.findByTestId('premium-screen');
}

/** Waits until the store product is loaded (the button is disabled before that). */
async function pressPurchase() {
  await screen.findByTestId('premium-price');
  await fireEvent.press(screen.getByTestId('premium-purchase'));
}

describe('paywall', () => {
  it('shows the store price, billing period, auto-renewal, cancellation and legal links', async () => {
    await start();
    await openPaywall();
    expect(await screen.findByTestId('premium-price')).toHaveTextContent(/¥350.*1か月/);
    expect(screen.getByTestId('premium-purchase')).toHaveTextContent('月額 ¥350 で登録する');
    const terms = screen.getByTestId('premium-terms');
    expect(terms).toHaveTextContent(/自動的に更新/);
    expect(terms).toHaveTextContent(/解約方法/);
    expect(screen.getByTestId('premium-terms-link')).toBeTruthy();
    expect(screen.getByTestId('premium-privacy-link')).toBeTruthy();
  });

  it('uses the price from the store, not a hard-coded one', async () => {
    const { mockBilling } = jest.requireActual('@/features/premium/billing/mock');
    const original = mockBilling.getPremiumPackage;
    mockBilling.getPremiumPackage = async () => ({ ...(await original()), priceString: '¥400' });
    try {
      await start();
      await openPaywall();
      expect(await screen.findByTestId('premium-price')).toHaveTextContent(/¥400/);
      expect(screen.getByTestId('premium-purchase')).toHaveTextContent('月額 ¥400 で登録する');
    } finally {
      mockBilling.getPremiumPackage = original;
    }
  });

  it('disables purchase when the store has no valid product and offers a retry', async () => {
    mockBillingState.offering = 'none';
    await start();
    await openPaywall();
    expect(await screen.findByTestId('premium-offering-error')).toBeTruthy();
    expect(screen.getByTestId('premium-purchase')).toBeDisabled();
  });
});

describe('purchase', () => {
  it('unlocks Premium graphs and statistics after a successful purchase', async () => {
    const r = await start();
    await openPaywall();
    await pressPurchase();
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Premiumへようこそ',
        expect.any(String),
        expect.anything(),
      ),
    );
    expect(mockBillingState.purchases).toBe(1);

    // the button in the alert closes the paywall
    const buttons = alert.mock.calls.at(-1)![2] as { onPress?: () => void }[];
    buttons[0]!.onPress?.();
    await waitFor(() => expect(r.getPathname()).toBe('/mypage'));
    expect(await screen.findByTestId('plan-name')).toHaveTextContent('Premium');
    expect(screen.getByTestId('plan-detail')).toHaveTextContent(/次回更新日/);

    await fireEvent.press(screen.getByTestId('tab-records'));
    expect(await screen.findByTestId('period-stats')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('30日'));
    expect(screen.queryByTestId('premium-screen')).toBeNull();
  });

  it('says nothing when the user cancels, and nothing is unlocked', async () => {
    mockBillingState.scenario = 'cancelled';
    await start();
    await openPaywall();
    await pressPurchase();
    await waitFor(() => expect(mockBillingState.attempts).toBe(1));
    await waitFor(() => expect(screen.getByTestId('premium-purchase')).toBeEnabled());
    expect(alert).not.toHaveBeenCalled();
    expect(mockBillingState.subscriptions.size).toBe(0);
  });

  it.each([
    ['pending', '購入の承認を待っています'],
    ['network', '通信できませんでした'],
    ['alreadyOwned', 'すでに購入済みのようです'],
    ['notAllowed', 'この端末では購入できません'],
  ] as const)('explains %s errors without unlocking', async (scenario, title) => {
    mockBillingState.scenario = scenario;
    await start();
    await openPaywall();
    await pressPurchase();
    await waitFor(() => expect(alert).toHaveBeenCalledWith(title, expect.any(String)));
    expect(mockBillingState.subscriptions.size).toBe(0);
  });

  it('does not start a purchase while offline', async () => {
    await start();
    await openPaywall();
    const fetch = jest
      .spyOn(NetInfo, 'fetch')
      .mockResolvedValue({ isConnected: false } as Awaited<ReturnType<typeof NetInfo.fetch>>);
    try {
      await pressPurchase();
      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith('通信できませんでした', expect.any(String)),
      );
      expect(mockBillingState.purchases).toBe(0);
    } finally {
      fetch.mockRestore();
    }
  });
});

describe('restore', () => {
  it('reports when there is nothing to restore', async () => {
    await start();
    await fireEvent.press(screen.getByTestId('tab-mypage'));
    await fireEvent.press(await screen.findByTestId('row-restore'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        '復元できる購入が見つかりませんでした',
        expect.any(String),
      ),
    );
  });

  it('restores an existing purchase', async () => {
    await start();
    mockBillingState.subscriptions.set('local-user', {
      entitlement: 'premium',
      status: 'cancelled',
      expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      will_renew: false,
      store: 'test_store',
    });
    await fireEvent.press(screen.getByTestId('tab-mypage'));
    await fireEvent.press(await screen.findByTestId('row-restore'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('購入を復元しました', expect.any(String)),
    );
    expect(await screen.findByTestId('plan-detail')).toHaveTextContent(/自動更新はオフです/);
  });
});

describe('expiry', () => {
  it('returns to the free plan once the subscription has expired', async () => {
    await start();
    mockBillingState.subscriptions.set('local-user', {
      entitlement: 'premium',
      status: 'cancelled',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      will_renew: false,
      store: 'test_store',
    });
    await fireEvent.press(screen.getByTestId('tab-records'));
    expect(screen.queryByTestId('period-stats')).toBeNull();
    await fireEvent.press(screen.getByTestId('tab-mypage'));
    expect(await screen.findByTestId('plan-name')).toHaveTextContent('無料プラン');
  });
});
