// What the model is told. The instructions stay the same for every page of a marriage book, so a
// provider can cache them. The page text is the only part that changes: the state, the strips and
// a slice of the dictionary.

import type { ReadState } from "./state.ts";

/** How many surnames go into one page. The rest still correct the reading afterwards. */
const SURNAMES_IN_PROMPT = 400;

/**
 * The standing instructions for a Galician marriage register (the Latin Sponsus form and the
 * Cyrillic years of the same books). Stable on purpose: it is the cached prefix.
 */
export const MARRIAGE_INSTRUCTIONS = `Ти читаєш одну сторінку метричної книги шлюбів (Греко-католицька Галичина, друкований бланк «Женихъ — Sponsus / Невѣста — Sponsa / Свидѣтели — Testes», записи латиною або кирилицею) і повертаєш лише JSON.

Сторінку дано смугами L1, L2, L3 (ліва сторінка зверху вниз) і R1, R2, R3 (права). Червона лінійка ліворуч смуги — пікселі цілого скана. Читай збільшені смуги. Нічого не домислюй: чого в записі немає, того в JSON немає.

Кожен запис шлюбу — подія type "marriage" у reading.events. Наречений — main: true. Наречена — особа зі зв'язком spouse до нареченого. Батько й мати — child від дитини до них; мати з дівочим прізвищем після «n.» / «nata» / «з д.». «def.» — покійний, окремо для батька й для матері, нотатка note «покійний на час запису». Свідки — witness до нареченого. «Copulavit …» — officiant до нареченого. «vidua post …» — покійний чоловік зі spouse до нареченої. Згоди й дозволи — note події, повністю. Заняття селянина (agricola) не пиши; інше заняття — occupation.

Імена — українською формою латинського: Joannes Іван, Gregorius Григорій, Michael Михайло, Demetrius Дмитро, Basilius Василь, Nicolaus Микола, Theodorus Теодор, Andreas Андрій, Jacobus Яків, Lucas Лука, Onuphrius Онуфрій, Elias Ілля, Petrus Петро, Paulus Павло, Stephanus Степан, Antonius Антін, Josephus Йосиф, Alexius Олексій, Georgius Юрій, Simon Симон, Catharina Катерина, Maria Марія, Anna Ганна, Parasceva Параскевія, Eudocia Євдокія, Pelagia Пелагія, Tatiana Тетяна, Sophia Софія, Barbara Варвара, Helena Олена, Irene Ірина, Anastasia Анастасія. Прізвище — у чоловічому роді, як прочитано. Слово, якого не розібрано, пропусти, а не вгадуй. Сумнів про ім'я, прізвище чи місце — у doubts (element, person, read, variants); у полі імені знаку питання немає.

Дата — YYYY-MM-DD. Рік сторінки — year. Знак повтору в даті — та сама дата, що вище. Два числа дому — note «house: N / M» нареченого й нареченої. Вік — ціле число років. Стан — marital «caelebs» або «viduus». Село — places і place особи.

Сторінка без записів (титул, засвідчення, порожня) — events порожній, а зміст у scan_attributes нотаткою note. Запис, обірваний на краю сторінки, допиши в carry.pending коротким текстом, щоб наступна сторінка його закінчила.

Відповідь — один JSON-об'єкт і нічого більше:
{"reading":{"scan":"ім'я скана","year":1884,"scan_attributes":[],"lines":[],"places":[],"households":[],"events":[],"doubts":[],"dictionary":[]},"carry":{"year":1884,"lastDate":null,"lastNumber":null,"officiant":null,"place":null,"pending":null}}
Ключі осіб унікальні в межах скана. Бокс, якщо даєш його, — пікселі цілого скана з лінійки; непевний бокс не пиши.`;

/** The text of one page: where the previous page stopped, then the strips, then the dictionary. */
export function pagePrompt(
  scan: string,
  state: ReadState,
  stripNames: readonly string[],
  surnames: readonly string[],
): string {
  const shown = surnames.slice(0, SURNAMES_IN_PROMPT);
  const rest = surnames.length - shown.length;
  const dictionary =
    shown.length === 0
      ? "Словник прізвищ справи ще порожній."
      : `Прізвища справи (підтверджують прочитане; написане інакше, але дуже схоже на одне з них, — помилка читання): ${shown.join(", ")}${rest > 0 ? ` … і ще ${String(rest)}` : ""}.`;
  const pending =
    state.pending === null || state.pending === ""
      ? "Незакінченого запису з попередньої сторінки немає."
      : `Попередня сторінка обірвала запис: ${state.pending}. Перші рядки цього скана можуть бути його кінцем.`;
  return [
    `Скан «${scan}». Смуги по порядку: ${stripNames.join(", ")}.`,
    `Стан: рік ${show(state.year)}, остання дата ${show(state.lastDate)}, номер ${show(state.lastNumber)}, священник ${show(state.officiant)}, місце ${show(state.place)}.`,
    pending,
    dictionary,
    "Поверни JSON, як сказано в інструкції. reading.scan має бути ім'ям цього скана.",
  ].join("\n");
}

function show(value: number | string | null): string {
  return value === null ? "—" : String(value);
}
