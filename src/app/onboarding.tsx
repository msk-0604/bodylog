import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Checkbox, Screen } from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { addWeight } from '@/data/repo/body';
import { getMeta, saveGoal, saveProfile } from '@/data/repo/profile';
import { getDb } from '@/data/db/expoDb';
import { toDateKey } from '@/domain/date';
import { ageOn, estimateCalorieGoal, inferGoalType, type GoalType } from '@/domain/goals';
import { LegalLinks, PENDING_TERMS_KEY, type PendingTerms } from '@/features/auth/legal';
import { refreshOnboarded } from '@/features/auth/session';
import { BodyFields } from '@/features/profile/BodyFields';
import { emptyBodyDraft, parseBodyDraft, type BodyDraft } from '@/features/profile/bodyForm';
import {
  draftFromEstimate,
  GoalEditor,
  parseGoalDraft,
  type GoalDraft,
} from '@/features/profile/GoalEditor';
import { config } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { deviceTimeZone } from '@/data/repo/common';
import { spacing } from '@/theme';

export default function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [body, setBody] = useState<BodyDraft>(emptyBodyDraft);
  const [goal, setGoal] = useState<GoalDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pendingTerms, setPendingTerms] = useState<PendingTerms | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDb()
      .then((db) => getMeta(db, PENDING_TERMS_KEY))
      .then((v) => setPendingTerms(v ? (JSON.parse(v) as PendingTerms) : null))
      .catch(() => {});
  }, []);

  const parsedBody = parseBodyDraft(body, true);
  const estimateFor = (goalType: GoalType) => {
    const v = parsedBody.value;
    const age = v?.birthDate ? ageOn(v.birthDate) : null;
    if (!v || v.weightKg === null || age === null) return null;
    return estimateCalorieGoal({
      weightKg: v.weightKg,
      heightCm: v.heightCm,
      age,
      sex: v.sex,
      activity: v.activity,
      goalType,
    });
  };
  const estimate = goal ? estimateFor(goal.goalType) : null;

  const next = () => {
    setSubmitted(true);
    if (!parsedBody.value) {
      haptics.warning();
      return;
    }
    const v = parsedBody.value;
    const type = inferGoalType(v.weightKg!, v.targetKg!);
    setGoal(draftFromEstimate(type, estimateFor(type)));
    setSubmitted(false);
    setStep(2);
  };

  const onGoalChange = (d: GoalDraft) => {
    // Changing 減量/維持/増量 re-applies the estimate while the user hasn't typed their own value.
    if (goal && d.goalType !== goal.goalType && (goal.usingEstimate || !goal.calorieText)) {
      const e = estimateFor(d.goalType);
      setGoal(e ? draftFromEstimate(d.goalType, e) : d);
    } else {
      setGoal(d);
    }
  };

  const needsAgreement = !pendingTerms;
  const finish = async () => {
    setSubmitted(true);
    const g = goal ? parseGoalDraft(goal).value : null;
    const b = parsedBody.value;
    if (!g || !b || (needsAgreement && !agreed)) {
      haptics.warning();
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const terms = pendingTerms ?? {
      termsVersion: config.termsVersion,
      privacyVersion: config.privacyVersion,
      acceptedAt: now,
    };
    try {
      await writeLocal(async (db, userId) => {
        await addWeight(db, userId, {
          weightKg: b.weightKg!,
          bodyFatPct: b.bodyFatPct,
          measuredAt: new Date(),
        });
        await saveGoal(db, userId, toDateKey(new Date()), {
          ...g,
          startWeightKg: b.weightKg,
          targetWeightKg: b.targetKg,
          calorieSource: goal?.usingEstimate ? 'estimate' : 'manual',
        });
        await saveProfile(db, userId, {
          nickname: b.nickname,
          height_cm: b.heightCm,
          birth_date: b.birthDate,
          sex: b.sex,
          activity_level: b.activity,
          time_zone: deviceTimeZone(),
          terms_version: terms.termsVersion,
          terms_accepted_at: terms.acceptedAt,
          privacy_version: terms.privacyVersion,
          privacy_accepted_at: terms.acceptedAt,
          onboarding_completed_at: now,
        });
      });
      haptics.success();
      await refreshOnboarded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={step === 1 ? 'はじめに' : '目標の設定'}
      eyebrow={`ステップ ${step} / 2`}
      testID="onboarding-screen"
    >
      {step === 1 ? (
        <View style={styles.gap}>
          <AppText variant="subhead" color="textSecondary">
            記録と目標の計算に使います。あとからマイページで変更できます。
          </AppText>
          <BodyFields
            draft={body}
            onChange={setBody}
            errors={submitted ? parsedBody.errors : {}}
            showWeights
          />
          <Button label="次へ" onPress={next} testID="onboarding-next" />
        </View>
      ) : (
        <View style={styles.gap}>
          {goal ? (
            <GoalEditor
              draft={goal}
              onChange={onGoalChange}
              estimate={estimate}
              currentKg={parsedBody.value?.weightKg ?? null}
              targetKg={parsedBody.value?.targetKg ?? null}
              showErrors={submitted}
            />
          ) : null}
          <Card>
            <AppText variant="footnote" color="textSecondary">
              食事・体重のリマインダー通知は、マイページの通知設定から後で設定できます。
            </AppText>
          </Card>
          {needsAgreement ? (
            <View style={styles.gapSm}>
              <Checkbox checked={agreed} onChange={setAgreed} testID="terms-checkbox">
                <AppText variant="subhead">利用規約とプライバシーポリシーに同意します</AppText>
              </Checkbox>
              <LegalLinks />
              {submitted && !agreed ? (
                <AppText variant="footnote" color="danger">
                  ご利用には同意が必要です
                </AppText>
              ) : null}
            </View>
          ) : null}
          <Button label="はじめる" onPress={finish} loading={saving} testID="onboarding-finish" />
          <Button label="戻る" variant="ghost" size="md" onPress={() => setStep(1)} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.xl },
  gapSm: { gap: spacing.sm },
});
