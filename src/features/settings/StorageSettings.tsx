import { formatNumber, useI18n } from '../../i18n';
import { ListGroup } from '../../shared/ui/ListGroup';
import { bytesToMib } from '../offline/offline.constants';
import type { OfflineSettingsState } from '../offline/useOfflineSettings';
import { useQueueStatus } from '../offline/useQueueStatus';
import { capacityChoices, capacityRejection, usageAmount } from './capacity';
import { ProgressBar } from './ProgressBar';
import { SelectRow } from './SelectRow';
import { CAPACITY_OPTIONS_MIB, USAGE_FRACTION_DIGITS } from './settings.config';
import './StorageSettings.css';

/** Space taken by songs waiting to upload, and the limit the person allows them. A failed save is reported by the page. */
export function StorageSettings({ offline }: { readonly offline: OfflineSettingsState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.storage;
  const { stats } = useQueueStatus();
  const { settings, update } = offline;

  const amount = (mib: number, fractionDigits = 0): string => formatNumber(mib, locale, { maximumFractionDigits: fractionDigits });
  const mibText = (bytes: number): string => texts.mib(amount(bytesToMib(bytes)));
  const used = usageAmount(stats.bytes, USAGE_FRACTION_DIGITS);
  const usedAmount = amount(used.mib, USAGE_FRACTION_DIGITS);
  // "12 of 64 MiB": the unit is written once, after the limit.
  const usage = settings
    ? (used.belowDisplay ? texts.usageBelow : texts.usage)(usedAmount, mibText(settings.maxBytes))
    : null;
  const choices = settings ? capacityChoices(CAPACITY_OPTIONS_MIB, settings.maxBytes, stats.bytes) : [];
  const limited = choices.some((choice) => !choice.allowed);

  const choose = (value: string): void => {
    const bytes = Number(value);
    // Re-checked here: the queue may have grown since the list was drawn, and the store would refuse it anyway.
    if (!settings || capacityRejection(bytes, stats.bytes) !== null) return;
    void update({ maxBytes: bytes });
  };

  return (
    <ListGroup title={texts.title}>
      <div className="bn-settings-storage">
        <div className="bn-settings-storage__line">
          <span>{texts.pending}</span>
          {usage && <span className="bn-settings-storage__value">{usage}</span>}
        </div>
        {settings && usage && <ProgressBar kind="meter" ratio={stats.bytes / settings.maxBytes} label={texts.pending} valueText={usage} />}
      </div>
      <SelectRow label={texts.capacity} value={settings ? String(settings.maxBytes) : ''} disabled={!settings}
        description={limited ? texts.capacityLimited(texts.mib(usedAmount)) : texts.capacityDetail}
        options={choices.map((choice) => ({ value: String(choice.bytes), label: mibText(choice.bytes), disabled: !choice.allowed }))}
        onChange={choose} />
    </ListGroup>
  );
}
