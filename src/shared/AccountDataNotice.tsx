import { useI18n } from '../i18n';
import { Button } from './ui/Button';
import { Notice } from './ui/Notice';
import type { AccountResource } from './useAccountResource';

/** Explain which account data could be read without hiding the records already on this device. */
export function AccountDataNotice({ resource }: { readonly resource: Pick<AccountResource<unknown>, 'status' | 'limited' | 'retry'> }): React.JSX.Element | null {
  const { dict } = useI18n();
  const { status, limited, retry } = resource;
  if (status === 'none' || (status === 'ready' && !limited)) return null;
  return <Notice tone={status === 'error' ? 'error' : 'info'} live
    action={status === 'error' ? <Button variant="quiet" onClick={retry}>{dict.common.actions.retry}</Button> : undefined}>
    {dict.common.accountData[status === 'ready' ? 'limited' : status]}
  </Notice>;
}
