import { useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { useAccountContext } from '../account/accountContext';
import { deleteRecording } from '../recordings/recordingStore';
import { deleteAccountRecording } from '../recordings/recordingsApi';
import type { LocalRecording } from '../recordings/useRecordings';
import { FragmentPlayer } from './FragmentPlayer';
import './RecordingCard.css';

export interface RecordingCardProps {
  readonly detectionId: string;
  readonly recording: LocalRecording;
  readonly online: boolean;
}

/** The clip of a song: its player, where it is kept said plainly, and the way to delete it from everywhere it is. */
export function RecordingCard({ detectionId, recording, online }: RecordingCardProps): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.log.detail.recording;
  const { session } = useAccountContext();
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const inAccount = recording.upload === 'uploaded';

  const remove = async (): Promise<void> => {
    setWorking(true);
    setFailed(false);
    try {
      // The account's copy goes first: if it cannot be deleted now, the phone keeps its clip and says so,
      // instead of leaving behind a copy the person believes gone.
      if (inAccount) {
        if (!session || !online) throw new Error('The account cannot be reached.');
        await deleteAccountRecording(session.access_token, detectionId);
      }
      await deleteRecording(detectionId);
    } catch {
      setFailed(true);
      setWorking(false);
    }
  };

  return (
    <div className="bn-log-recording">
      <FragmentPlayer fragment={recording} labels={texts} />
      <div className="bn-log-recording__foot">
        <p className="bn-log-recording__place">{inAccount ? texts.inAccount : texts.onPhone}</p>
        <Button variant="quiet" icon="close" disabled={working} onClick={() => { void remove(); }}>{texts.delete}</Button>
      </div>
      {failed && <Notice tone="error" live>{texts.deleteFailed}</Notice>}
    </div>
  );
}
