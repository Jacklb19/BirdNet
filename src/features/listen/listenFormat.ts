import { formatNumber, formatPercent, type Messages } from '../../i18n';
import type { Locale } from '../../i18n/locales';
import { CONFIDENCE_FRACTION_DIGITS } from './listen.config';
import type { HeardAgo } from './listenState';

type ListenMessages = Messages['listen'];

export function heardAgoText(heard: HeardAgo, locale: Locale, messages: ListenMessages): string {
  switch (heard.unit) {
    case 'now': return messages.list.heard.now;
    case 'moment': return messages.list.heard.moment;
    case 'minutes': return messages.list.heard.minutes(formatNumber(heard.value, locale));
    case 'hours': return messages.list.heard.hours(formatNumber(heard.value, locale));
  }
}

export function confidenceText(confidence: number, locale: Locale): string {
  return formatPercent(confidence, locale, CONFIDENCE_FRACTION_DIGITS);
}
