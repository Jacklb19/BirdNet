import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { intlTag, useI18n } from '../../i18n';
import { addDays, addMonths, compareDates, fromDate, joinLocal, monthGrid, parseTime, sameDate, splitLocal, weekday, weekStart, type CalendarDate } from './calendar';
import { Icon } from './Icon';
import { usePopover } from './usePopover';
import './Popover.css';
import './DateTimeField.css';

export interface DateTimeFieldProps {
  readonly label: string;
  /** Local "YYYY-MM-DDTHH:mm", the value a datetime-local input holds, or '' when nothing is set. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
  /** Latest day that can be chosen (an observation cannot be in the future). */
  readonly max?: Date;
}

const toUtc = (date: CalendarDate): Date => new Date(Date.UTC(date.year, date.month - 1, date.day));

/**
 * Date and time of a record, drawn with Trino's tokens (ADR-47): a calendar that opens from the field and a time
 * typed as on a phone ("7", "7:05", "0730"). The value keeps the local format of a datetime-local input, so callers
 * convert it exactly as before. The calendar is a small dialog: arrows move by day and week, Page Up and Page Down
 * by month, Home and End to the week's ends, Enter chooses and Escape closes, giving the focus back to the field.
 */
export function DateTimeField({ label, value, onChange, required = false, disabled = false, hint, max }: DateTimeFieldProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.common.controls.date;
  const id = useId();
  const dialogId = `${id}-calendar`;
  const titleId = `${id}-month`;
  const hintId = `${id}-hint`;
  const { date, time } = splitLocal(value);
  const today = fromDate(new Date());
  const latest = max ? fromDate(max) : null;
  const wrapper = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<CalendarDate>(date ?? today);
  const [timeText, setTimeText] = useState(time);
  const close = useCallback(() => { setOpen(false); }, []);
  const style = usePopover(open, wrapper, dialog, close, { width: 'own', heightToken: '--calendar-max-height', widthToken: '--calendar-max-width' });

  // A value set from outside (a saved record, a reset form) replaces what the time field shows.
  const [shown, setShown] = useState(value);
  if (shown !== value) { setShown(value); setTimeText(time); }

  // The day with the focus is a real button: moving it moves the keyboard focus inside the calendar.
  useEffect(() => {
    if (open) dialog.current?.querySelector<HTMLButtonElement>('[data-focused="true"]')?.focus();
  }, [open, focused]);

  useEffect(() => {
    const message = required && !date ? texts.chooseDate : timeText.trim() && !parseTime(timeText) ? texts.invalidTime : '';
    timeInput.current?.setCustomValidity(message);
  }, [required, date, timeText, texts.chooseDate, texts.invalidTime]);

  const allowed = (day: CalendarDate): boolean => !latest || compareDates(day, latest) <= 0;
  const currentTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };
  const choose = (day: CalendarDate): void => {
    if (!allowed(day)) return;
    const chosenTime = parseTime(timeText) ?? currentTime();
    setTimeText(chosenTime);
    onChange(joinLocal(day, chosenTime));
    setOpen(false);
    trigger.current?.focus();
  };
  const commitTime = (): void => {
    const parsed = parseTime(timeText);
    if (!parsed) return;
    setTimeText(parsed);
    if (date) onChange(joinLocal(date, parsed));
  };
  const openCalendar = (): void => { setFocused(date ?? today); setOpen(true); };

  const firstDay = weekStart(intlTag(locale));
  const weeks = monthGrid(focused.year, focused.month, firstDay);
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(toUtc({ ...focused, day: 1 }));
  const dayLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const header = weeks[0] ?? [];
  const shownDate = date ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(toUtc(date)) : texts.pick;

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const start = (weekday(focused) - firstDay + 7) % 7;
    const moves: Record<string, () => CalendarDate> = {
      ArrowLeft: () => addDays(focused, -1), ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7), ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1), PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
      Home: () => addDays(focused, -start), End: () => addDays(focused, 6 - start),
    };
    const move = moves[event.key];
    if (move) { event.preventDefault(); setFocused(move()); return; }
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  };

  return (
    <fieldset className="bn-datetime" disabled={disabled} aria-describedby={hint ? hintId : undefined}>
      <legend className="bn-datetime__label">{label}</legend>
      <div className="bn-datetime__row">
        <div ref={wrapper} className="bn-datetime__date">
          <button ref={trigger} type="button" className={`bn-datetime__field${date ? '' : ' bn-datetime__field--empty'}`}
            aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
            aria-label={date ? texts.changeDate(dayLabel.format(toUtc(date))) : texts.pick}
            onClick={() => { if (open) setOpen(false); else openCalendar(); }}>
            <Icon name="clock" size="s" />
            <span>{shownDate}</span>
          </button>
        </div>
        <label className="bn-datetime__time">
          <span className="visually-hidden">{texts.time}</span>
          <input ref={timeInput} className="bn-datetime__time-input" inputMode="numeric" autoComplete="off" placeholder={texts.timePlaceholder}
            value={timeText} required={required} maxLength={5} aria-invalid={timeText.trim() !== '' && !parseTime(timeText) ? true : undefined}
            onChange={(event) => { setTimeText(event.target.value); }} onBlur={commitTime}
            onKeyDown={(event) => { if (event.key === 'Enter') commitTime(); }} />
        </label>
      </div>
      {hint && <p id={hintId} className="bn-datetime__hint">{hint}</p>}
      {createPortal(
        <div ref={dialog} id={dialogId} role="dialog" aria-modal="false" aria-labelledby={titleId} hidden={!open} style={style}
          className="bn-popover bn-calendar" onBlur={(event) => {
            if (!dialog.current?.contains(event.relatedTarget) && !wrapper.current?.contains(event.relatedTarget)) setOpen(false);
          }}>
          <div className="bn-calendar__head">
            <button type="button" className="bn-calendar__nav" aria-label={texts.previousMonth} onClick={() => { setFocused(addMonths(focused, -1)); }}>
              <Icon name="back" size="s" />
            </button>
            <p id={titleId} className="bn-calendar__title display" aria-live="polite">{monthTitle}</p>
            <button type="button" className="bn-calendar__nav bn-calendar__nav--next" aria-label={texts.nextMonth} onClick={() => { setFocused(addMonths(focused, 1)); }}>
              <Icon name="chevron" size="s" />
            </button>
          </div>
          <div role="grid" aria-labelledby={titleId} className="bn-calendar__grid" onKeyDown={onGridKey}>
            <div role="row" className="bn-calendar__week">
              {header.map((day) => (
                <span key={`${String(day.month)}-${String(day.day)}`} role="columnheader" className="bn-calendar__weekday" aria-label={weekdayLong.format(toUtc(day))}>
                  {weekdayName.format(toUtc(day))}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={`${String(week[0]?.month)}-${String(week[0]?.day)}`} role="row" className="bn-calendar__week">
                {week.map((day) => {
                  const isFocused = sameDate(day, focused);
                  const outside = day.month !== focused.month;
                  return (
                    <span key={`${String(day.month)}-${String(day.day)}`} role="gridcell" aria-selected={sameDate(day, date)}>
                      <button type="button" tabIndex={isFocused ? 0 : -1} data-focused={isFocused} disabled={!allowed(day)}
                        aria-label={dayLabel.format(toUtc(day))} aria-current={sameDate(day, today) ? 'date' : undefined}
                        className={['bn-calendar__day', outside ? 'bn-calendar__day--outside' : '', sameDate(day, date) ? 'bn-calendar__day--chosen' : '',
                          sameDate(day, today) ? 'bn-calendar__day--today' : ''].filter(Boolean).join(' ')}
                        onClick={() => { choose(day); }}>
                        {day.day}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="bn-calendar__foot">
            <button type="button" className="bn-calendar__today" disabled={!allowed(today)} onClick={() => { choose(today); }}>{texts.today}</button>
          </div>
        </div>,
        document.body,
      )}
    </fieldset>
  );
}
