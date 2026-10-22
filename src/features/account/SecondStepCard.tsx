import { useId, useState, type SyntheticEvent } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { useOnline } from '../offline/useQueueStatus';
import { AUTHENTICATOR_CODE_LENGTH } from './account.constants';
import type { Enrollment } from './secondFactor';
import { CodeField } from './SecondStepForm';
import type { AccountState } from './useAccount';
import './SecondStepCard.css';

type Step = { readonly kind: 'idle' } | { readonly kind: 'enrolling'; readonly enrollment: Enrollment } | { readonly kind: 'disabling' };

/**
 * Two-step verification in Account (ADR-39): turned on by adding Trino to an authenticator app and typing its first
 * code; turned off only with a current code. One authenticator per account.
 */
export function SecondStepCard({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.account.secondStep;
  const online = useOnline();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [outcome, setOutcome] = useState<'on' | 'off' | null>(null);
  const titleId = useId();
  const complete = code.length === AUTHENTICATOR_CODE_LENGTH;

  const start = async (): Promise<void> => {
    setOutcome(null);
    const enrollment = await account.startSecondStep();
    if (enrollment) setStep({ kind: 'enrolling', enrollment });
  };

  const cancel = (): void => {
    if (step.kind === 'enrolling') void account.cancelSecondStep(step.enrollment.factorId);
    setStep({ kind: 'idle' });
    setCode('');
    setCopied(false);
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!complete || account.working) return;
    const done = step.kind === 'enrolling'
      ? await account.confirmSecondStep(step.enrollment.factorId, code)
      : await account.turnOffSecondStep(code);
    setCode('');
    if (done) {
      setOutcome(step.kind === 'enrolling' ? 'on' : 'off');
      setStep({ kind: 'idle' });
    }
  };

  const copySecret = async (secret: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="bn-second-step" aria-labelledby={titleId}>
      <h2 id={titleId} className="bn-second-step__title">{texts.title}</h2>
      {step.kind === 'idle' && (
        <>
          <p className="bn-second-step__text">
            {account.secondStep === null ? texts.unknown : account.secondStep ? texts.onText : texts.offText}
          </p>
          {outcome && <Notice tone="success" icon="check" live>{outcome === 'on' ? texts.done : texts.turnedOff}</Notice>}
          {account.error && <Notice tone="error" live>{dict.account.errors[account.error]}</Notice>}
          {account.secondStep !== null && (
            <div className="bn-second-step__actions">
              <Button variant={account.secondStep ? 'secondary' : 'primary'} disabled={!online} aria-busy={account.working}
                onClick={() => { if (account.secondStep) setStep({ kind: 'disabling' }); else void start(); }}>
                {account.secondStep ? texts.turnOff : account.working ? texts.starting : texts.turnOn}
              </Button>
              {!online && <p className="bn-second-step__hint">{texts.needsConnection}</p>}
            </div>
          )}
        </>
      )}
      {step.kind !== 'idle' && (
        <form className="bn-second-step__form" onSubmit={(event) => { void submit(event); }}>
          {step.kind === 'enrolling' && (
            <>
              <p className="bn-second-step__text">{texts.stepScan}</p>
              <div className="bn-second-step__enroll">
                <img className="bn-second-step__qr" src={step.enrollment.qrCode} alt={texts.qrAlt} width={176} height={176} />
                <div className="bn-second-step__secret">
                  <span className="bn-second-step__label">{texts.secret}</span>
                  <code className="bn-second-step__key">{step.enrollment.secret}</code>
                  <Button variant="quiet" icon={copied ? 'check' : undefined} onClick={() => { void copySecret(step.enrollment.secret); }}>
                    {copied ? texts.copied : texts.copy}
                  </Button>
                </div>
              </div>
              <p className="bn-second-step__text">{texts.stepConfirm}</p>
            </>
          )}
          {step.kind === 'disabling' && <p className="bn-second-step__text">{texts.offAsk}</p>}
          <CodeField label={texts.code} value={code} onChange={setCode} />
          {account.error && <Notice tone="error" live>{dict.account.errors[account.error]}</Notice>}
          <div className="bn-second-step__actions">
            <Button type="submit" aria-disabled={!complete || account.working} aria-busy={account.working}>
              {account.working ? texts.checking : step.kind === 'enrolling' ? texts.confirm : texts.confirmOff}
            </Button>
            <Button type="button" variant="quiet" disabled={account.working} onClick={cancel}>{dict.common.actions.cancel}</Button>
          </div>
        </form>
      )}
    </section>
  );
}
