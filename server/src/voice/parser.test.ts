import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleBasedParser } from './parser.js';
import { transliterateTamil, similarity } from './text.js';

const ctx = {
  today: '2026-09-28',
  sections: ['Production', 'Maintenance', 'Electrical', 'Lab', 'Stores', 'IT', 'Admin', 'HR'].map((name, i) => ({ id: i + 1, name })),
  users: ['Pradeep', 'Ashok', 'Kumar', 'Ravi'].map((name, i) => ({ id: i + 1, name })),
  items: ['Bearing', 'V-Belt', 'A4 Paper', 'Electrical Cable', 'Grease', 'Printer Toner'],
};

const parse = (s: string) => ruleBasedParser.parse(s, ctx);

test('Tanglish: the headline example', () => {
  const r = parse('Maintenance-ku rendu bearing urgent-ah venum. Ashok-ku assign pannunga.');
  assert.equal(r.title, 'Bearing');
  assert.equal(r.quantity, 2);
  assert.equal(r.unit, 'Nos');
  assert.equal(r.section?.name, 'Maintenance');
  assert.equal(r.assignee?.name, 'Ashok');
  assert.equal(r.priority, 'urgent');
  assert.deepEqual(r.missing, []);
  assert.ok(r.confident);
});

test('Tanglish without hyphens, as speech engines usually return it', () => {
  const r = parse('maintenance ku rendu bearing urgent ah venum ashok ku assign pannunga');
  assert.equal(r.title, 'Bearing');
  assert.equal(r.quantity, 2);
  assert.equal(r.section?.name, 'Maintenance');
  assert.equal(r.assignee?.name, 'Ashok');
  assert.equal(r.priority, 'urgent');
});

test('Glued suffixes: maintenanceku / ashokku', () => {
  const r = parse('maintenanceku 2 bearing venum ashokku assign pannunga');
  assert.equal(r.section?.name, 'Maintenance');
  assert.equal(r.assignee?.name, 'Ashok');
  assert.equal(r.quantity, 2);
  assert.equal(r.title, 'Bearing');
});

test('English', () => {
  const r = parse('2 bearing required for maintenance');
  assert.equal(r.title, 'Bearing');
  assert.equal(r.quantity, 2);
  assert.equal(r.section?.name, 'Maintenance');
  assert.equal(r.assignee, null);
  assert.equal(r.priority, 'normal');
  assert.deepEqual(r.missing, ['assignee']);
});

test('Units: meters', () => {
  const r = parse('Electrical-ku 10 meter cable urgent-ah purchase pannunga');
  assert.equal(r.section?.name, 'Electrical');
  assert.equal(r.quantity, 10);
  assert.equal(r.unit, 'M');
  assert.equal(r.title, 'Cable');
  assert.equal(r.priority, 'urgent');
});

test('Unknown section is reported, item with digits kept', () => {
  const r = parse('Stationery la A4 paper 5 packet venum');
  assert.equal(r.section, null);
  assert.equal(r.unmatched.section, 'Stationery');
  assert.equal(r.quantity, 5);
  assert.equal(r.unit, 'Packets');
  assert.equal(r.title, 'A4 Paper');
});

test('Glued number+unit and assign to', () => {
  const r = parse('Need 5kg grease for maintenance, assign to Kumar, tomorrow');
  assert.equal(r.quantity, 5);
  assert.equal(r.unit, 'Kg');
  assert.equal(r.title, 'Grease');
  assert.equal(r.assignee?.name, 'Kumar');
  assert.equal(r.dueDate, '2026-09-29');
});

test('Unknown person is reported', () => {
  const r = parse('Stores ku 4 gloves venum Suresh ku assign pannunga');
  assert.equal(r.section?.name, 'Stores');
  assert.equal(r.assignee, null);
  assert.equal(r.unmatched.person, 'Suresh');
  assert.equal(r.title, 'Gloves');
  assert.equal(r.quantity, 4);
});

test('Short section names only match when used as a name', () => {
  assert.equal(parse('IT ku 2 mouse venum').section?.name, 'IT');
  assert.equal(parse('please purchase it 2 mouse').section, null);
});

test('Tamil script', () => {
  const r = parse('மெயின்டனன்ஸ்க்கு ரெண்டு பேரிங் அவசரமா வேணும் அசோக்கு அசைன் பண்ணுங்க');
  assert.equal(r.section?.name, 'Maintenance');
  assert.equal(r.quantity, 2);
  assert.equal(r.priority, 'urgent');
  assert.equal(r.assignee?.name, 'Ashok');
  assert.equal(r.title, 'Bearing');
});

test('Incomplete speech is not confident', () => {
  const r = parse('ashok please');
  assert.equal(r.title, null);
  assert.equal(r.quantity, null);
  assert.equal(r.confident, false);
});

test('Prepositions are not quantities', () => {
  const r = parse('bearing for maintenance');
  assert.equal(r.quantity, null);
  assert.equal(r.title, 'Bearing');
});

test('transliteration and phonetic similarity', () => {
  assert.equal(transliterateTamil('அசோக்'), 'asook');
  assert.ok(similarity('asook', 'Ashok') >= 0.8);
  assert.ok(similarity(transliterateTamil('குமார்'), 'Kumar') >= 0.8);
  assert.ok(similarity('cable', 'Lab') < 0.5);
});
