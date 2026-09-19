import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMessage, formatDate, makeCode, plural, whatsappUrl } from '../src/lib/booking.js';

const branches = JSON.parse(readFileSync(new URL('../src/data/branches.json', import.meta.url)));

test('склонение слова «компьютер»', () => {
  const f = (n) => plural(n, 'компьютер', 'компьютера', 'компьютеров');
  assert.equal(f(1), 'компьютер');
  assert.equal(f(3), 'компьютера');
  assert.equal(f(5), 'компьютеров');
  assert.equal(f(11), 'компьютеров');
  assert.equal(f(12), 'компьютеров');
  assert.equal(f(21), 'компьютер');
  assert.equal(f(22), 'компьютера');
});

test('дата с днём недели', () => {
  assert.equal(formatDate('2026-09-19'), '19 сентября (сб)');
  assert.equal(formatDate('2027-01-01'), '1 января (пт)');
});

test('сообщение для компании', () => {
  const text = buildMessage({
    branchName: 'Premium', date: '2026-09-19', time: '21:00', people: 3,
    zoneName: 'VIP Varmilo', duration: 'на 3 часа', together: true, code: 'A7K2',
  });
  assert.equal(
    text,
    'Здравствуйте! Хотим забронировать 3 компьютера в Pacman Premium на 19 сентября (сб) в 21:00, на 3 часа.\nЗона: VIP Varmilo.\nЖелательно места рядом.\n\nЗаявка с сайта #A7K2',
  );
});

test('сообщение для одного: «хочу», без «мест рядом»', () => {
  const text = buildMessage({ branchName: 'Gold', date: '2026-09-20', time: '10:30', people: 1, together: true, code: 'ZZZZ' });
  assert.match(text, /^Здравствуйте! Хочу забронировать 1 компьютер в Pacman Gold/);
  assert.doesNotMatch(text, /рядом/);
  assert.doesNotMatch(text, /Зона/);
});

test('ссылка WhatsApp кодирует переносы и кириллицу', () => {
  const url = whatsappUrl('77080404048', 'Привет!\n#A7K2');
  assert.equal(url, 'https://wa.me/77080404048?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82!%0A%23A7K2');
});

test('код заявки: 4 символа без похожих букв и цифр', () => {
  for (let i = 0; i < 200; i++) assert.match(makeCode(), /^[A-HJ-NPR-Z2-9]{4}$/);
});

test('у каждого филиала свой номер WhatsApp в формате 7XXXXXXXXXX', () => {
  const numbers = branches.map((b) => b.whatsapp);
  assert.equal(new Set(numbers).size, branches.length);
  for (const n of numbers) assert.match(n, /^7\d{10}$/);
});

test('у каждой зоны заполнены все цены', () => {
  for (const b of branches) {
    for (const z of b.zones) {
      for (const k of ['h1', 'h3', 'h5', 'morning', 'day', 'night', 'turbo']) {
        assert.ok(Number.isInteger(z.prices[k]) && z.prices[k] > 0, `${b.slug}/${z.id}/${k}`);
      }
      assert.ok(z.prices.h3 < z.prices.h1 * 3, `${b.slug}/${z.id}: пакет 3 ч должен быть выгоднее почасовой`);
      assert.ok(z.prices.h5 < z.prices.h1 * 5, `${b.slug}/${z.id}: пакет 5 ч должен быть выгоднее почасовой`);
    }
  }
});
