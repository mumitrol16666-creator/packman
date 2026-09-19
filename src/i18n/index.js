import ru from './ru.js';
import kk from './kk.js';

export const LANGS = ['ru', 'kk'];
const dictionaries = { ru, kk };

/** Словарь интерфейса для языка. */
export function ui(lang) {
  return dictionaries[lang] || ru;
}

/** Кусок адреса для языка: русская версия живёт в корне, казахская — в /kz/. */
export function langPrefix(lang) {
  return lang === 'kk' ? '/kz' : '';
}

/**
 * Перевод поля контента. В JSON у переводимого поля есть пара с суффиксом _kk:
 * title и title_kk. Пустой перевод не ломает страницу: показывается русский текст.
 */
export function loc(object, field, lang) {
  if (lang === 'kk') {
    const value = object?.[`${field}_kk`];
    if (Array.isArray(value) ? value.length : value) return value;
  }
  return object?.[field];
}
