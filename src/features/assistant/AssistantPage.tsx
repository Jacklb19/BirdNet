import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAccountContext } from '../account/accountContext';
import { ActivePlan } from './ActivePlan';
import { AnswerCard } from './AnswerCard';
import { ASSISTANT_LIMITS, CONSENT_VERSION, THREAD_FOLLOW_PX } from './assistant.config';
import { assistantMessages } from './i18n';
import { useAssistant, type AssistantState, type Message } from './useAssistant';
import './AssistantPage.css';

type Texts = (typeof assistantMessages)['es'];
const HELP_TOPICS = ['confidence', 'detection_status', 'recording_privacy', 'approximate_location'] as const;

/** What leaves the phone, told plainly, with the provider's own terms one link away. */
function ConsentDetail({ state, texts }: { readonly state: AssistantState; readonly texts: Texts }): React.JSX.Element {
  return (
    <details className="bn-assistant__detail">
      <summary>{texts.consent.detail}</summary>
      <p>{texts.consent.sent}</p>
      {state.policy ? <p>{texts.consent.provider(state.policy.provider)}</p> : <p role="status">{texts.consent.checking}</p>}
      <p>{texts.consent.quota}</p>
      <p>{texts.consent.revocable}</p>
      {state.policy && <a href={state.policy.terms_url} target="_blank" rel="noreferrer">{texts.consent.terms}</a>}
    </details>
  );
}

function ConsentCard({ text, state, texts }: { readonly text: string; readonly state: AssistantState; readonly texts: Texts }): React.JSX.Element {
  const current = state.policy?.version === CONSENT_VERSION;
  return (
    <div className="bn-assistant__consent">
      <h3 className="bn-assistant__consent-title">{texts.consent.title}</h3>
      <p>{texts.consent.text}</p>
      <ConsentDetail state={state} texts={texts} />
      {state.accepted && <p role="status">{texts.consent.accepted}</p>}
      {state.accepted ? null : (
        <Button icon="check" disabled={!current || !state.usable || state.busy !== null} onClick={() => { state.approveAndSend(text); }}>{texts.consent.accept}</Button>
      )}
    </div>
  );
}

function Bubble({ message, state, texts }: { readonly message: Message; readonly state: AssistantState; readonly texts: Texts }): React.JSX.Element {
  switch (message.kind) {
    case 'user': return <p className="bn-assistant__mine">{message.text}</p>;
    case 'answer': return <AnswerCard plan={message.plan} answer={message.answer} active={state.active?.id === message.id} busy={state.busy !== null} onMore={() => { void state.more(); }} />;
    case 'consent': return <ConsentCard text={message.text} state={state} texts={texts} />;
    case 'failure': return <Notice tone="error">{texts.errors[message.failure]}</Notice>;
    case 'notOnScreen': return <p>{texts.notOnScreen}</p>;
    case 'noMore': return <p>{texts.noMore}</p>;
    case 'tutor': return (
      <div className="bn-assistant__tutor">
        {message.answer.paragraphs.map((paragraph, index) => <p key={String(index)}>{paragraph}</p>)}
        <p className="bn-assistant__sources label">{texts.sources}</p>
        <ul className="bn-assistant__source-list">
          {message.answer.sources.map((source, index) => (
            <li key={String(index)}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}{source.license ? ` · ${source.license}` : ''}</li>
          ))}
        </ul>
      </div>
    );
    case 'reason': return (
      <div className="bn-assistant__reason">
        <p>{texts.reasons[message.reason]}</p>
        {message.reason === 'outside_scope' && <HelpChips state={state} texts={texts} />}
      </div>
    );
  }
}

function HelpChips({ state, texts }: { readonly state: AssistantState; readonly texts: Texts }): React.JSX.Element {
  return (
    <ul className="bn-assistant__chips">
      {HELP_TOPICS.map((topic) => (
        <li key={topic}><button type="button" className="bn-assistant__chip" disabled={!state.usable || state.busy !== null} onClick={() => { void state.explain(topic, texts.topics[topic]); }}>{texts.topics[topic]}</button></li>
      ))}
      <li><button type="button" className="bn-assistant__chip" disabled={!state.usable || state.busy !== null} onClick={() => { state.send(texts.speciesExample); }}>{texts.speciesExample}</button></li>
    </ul>
  );
}

function Welcome({ state, texts }: { readonly state: AssistantState; readonly texts: Texts }): React.JSX.Element {
  return (
    <div className="bn-assistant__welcome">
      <h2 className="bn-assistant__welcome-title display">{texts.welcome.title}</h2>
      <p>{texts.welcome.text}</p>
      <details className="bn-assistant__examples">
        <summary>{texts.welcome.records}</summary>
        <ul className="bn-assistant__chips">
          {texts.examples.map((example) => (
            <li key={example}><button type="button" className="bn-assistant__chip" disabled={!state.usable || state.busy !== null} onClick={() => { state.send(example); }}>{example}</button></li>
          ))}
        </ul>
      </details>
      <details className="bn-assistant__examples">
        <summary>{texts.welcome.help}</summary>
        <p>{texts.welcome.helpQuota}</p>
        <HelpChips state={state} texts={texts} />
      </details>
    </div>
  );
}

function AssistantContents({ owner, token }: { readonly owner: string; readonly token: string | null }): React.JSX.Element {
  const { locale } = useI18n();
  const texts = assistantMessages[locale];
  const state = useAssistant(owner, token, locale);
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);
  const max = state.policy?.max_text_characters ?? ASSISTANT_LIMITS.text;
  const used = Array.from(state.draft).length;

  // New messages scroll into view only for someone reading the latest; reading back keeps its place (ADR-47).
  useEffect(() => {
    const track = (): void => { following.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - THREAD_FOLLOW_PX; };
    track();
    window.addEventListener('scroll', track, { passive: true });
    return () => { window.removeEventListener('scroll', track); };
  }, []);
  useLayoutEffect(() => {
    if (state.messages.length > 0 && following.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [state.messages.length, state.busy]);

  const submit = (): void => { state.send(); input.current?.focus(); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
  };

  return (
    <Page width="narrow" className="bn-assistant">
      <PageHeader title={texts.title} subtitle={texts.intro}
        actions={state.messages.length ? <Button variant="quiet" icon="plus" onClick={() => { state.reset(); input.current?.focus(); }}>{texts.newQuery}</Button> : undefined} />
      {!state.online && <Notice tone="caution" icon="offline">{texts.errors.network}</Notice>}
      {state.error && <Notice tone={state.error === 'policyChanged' ? 'caution' : 'error'}>{texts.errors[state.error]}</Notice>}
      <details className="bn-assistant__privacy">
        <summary><Icon name="privacy" size="s" /><span>{texts.privacy}</span></summary>
        <p>{state.accepted ? texts.consent.accepted : texts.consent.notAccepted}</p>
        <ConsentDetail state={state} texts={texts} />
        {state.accepted && <Button variant="quiet" onClick={state.withdraw}>{texts.consent.withdraw}</Button>}
      </details>

      <section className="bn-assistant__thread" role="log" aria-live="polite" aria-label={texts.thread}>
        {state.messages.length === 0 && <Welcome state={state} texts={texts} />}
        {state.messages.map((message) => (
          <article key={message.id} className={`bn-assistant__message bn-assistant__message--${message.kind === 'user' ? 'mine' : 'theirs'}`}
            aria-label={message.kind === 'user' ? texts.you : texts.assistant}>
            <Bubble message={message} state={state} texts={texts} />
          </article>
        ))}
        {state.busy && <p className="bn-assistant__working" role="status">{texts.working[state.busy]}</p>}
      </section>

      <form className="bn-assistant__composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {state.active && (
          <ActivePlan plan={state.active.plan} busy={state.busy !== null} onChange={(next) => { void state.ask(next); }} />
        )}
        <div className="bn-assistant__field">
          <label htmlFor={inputId} className="visually-hidden">{texts.composer.label}</label>
          <textarea ref={input} id={inputId} className="bn-assistant__input" rows={1} value={state.draft} maxLength={max * 2}
            placeholder={texts.composer.placeholder} aria-describedby={hintId} disabled={!state.usable}
            onChange={(event) => { state.setDraft(Array.from(event.target.value).slice(0, max).join('')); }} onKeyDown={onKeyDown} />
          {state.busy
            ? <button type="button" className="bn-assistant__send" aria-label={texts.composer.cancel} onClick={state.cancel}><Icon name="close" /></button>
            : <button type="submit" className="bn-assistant__send" aria-label={texts.composer.send} disabled={!state.draft.trim() || !state.usable}><Icon name="chevron" /></button>}
        </div>
        <p id={hintId} className="bn-assistant__hint">
          {texts.composer.hint}
          {used > max * 0.8 && <span> · {texts.composer.count(formatNumber(used, locale), formatNumber(max, locale))}</span>}
        </p>
      </form>
    </Page>
  );
}

/** The assistant (ADR-46, ADR-47): one conversation per account, mounted again for another one. */
export function AssistantPage(): React.JSX.Element | null {
  const { identity, session } = useAccountContext();
  return identity ? <AssistantContents key={identity.userId} owner={identity.userId} token={session?.access_token ?? null} /> : null;
}
export default AssistantPage;
