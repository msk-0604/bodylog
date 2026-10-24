import { useState } from 'react';

import { Button, closeModal, LoadingView, ModalScreen } from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { saveProfile, type Profile } from '@/data/repo/profile';
import { BodyFields } from '@/features/profile/BodyFields';
import { emptyBodyDraft, parseBodyDraft, type BodyDraft } from '@/features/profile/bodyForm';
import { useProfile } from '@/features/profile/hooks';
import { haptics } from '@/lib/haptics';

export default function ProfileScreen() {
  const { data: profile, isLoading } = useProfile();
  if (isLoading) return <LoadingView />;
  return <ProfileForm profile={profile ?? null} />;
}

function ProfileForm({ profile }: { profile: Profile | null }) {
  const [draft, setDraft] = useState<BodyDraft>({
    ...emptyBodyDraft,
    nickname: profile?.nickname ?? '',
    heightText: profile?.heightCm ? String(profile.heightCm) : '',
    birthText: profile?.birthDate ?? '',
    sex: profile?.sex ?? 'unspecified',
    activity: profile?.activityLevel ?? 'moderate',
  });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const { value, errors } = parseBodyDraft(draft, false);

  const save = async () => {
    setSubmitted(true);
    if (!value) {
      haptics.warning();
      return;
    }
    setSaving(true);
    try {
      await writeLocal((db, uid) =>
        saveProfile(db, uid, {
          nickname: value.nickname,
          height_cm: value.heightCm,
          birth_date: value.birthDate,
          sex: value.sex,
          activity_level: value.activity,
        }),
      );
      haptics.success();
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalScreen title="プロフィール" testID="profile-screen">
      <BodyFields
        draft={draft}
        onChange={setDraft}
        errors={submitted ? errors : {}}
        showWeights={false}
      />
      <Button label="保存" onPress={() => void save()} loading={saving} />
    </ModalScreen>
  );
}
