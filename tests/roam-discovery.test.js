const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');

test('selected pills retain the individual requirements and hide place requirements in Events', () => {
  const holder = {};
  const context = {
    $: () => holder,
    tab: 'places',
    T: { removeTag: 'Remove' },
    esc: text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    candidates: () => [
      { id: 'town:kelowna', label: 'Kelowna' },
      { id: 'term', label: 'Coffee' },
      { id: 'open', label: 'Open now' },
      { id: 'feat:dogs', label: 'Dogs OK' },
      { id: 'feat:gf', label: 'Gluten-free' },
    ],
  };
  const start = source.indexOf('  function updateSelectionChips(){');
  const end = source.indexOf("  $('rnSelectedFilters').addEventListener", start);
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + ';updateSelectionChips()', context);
  assert.equal(holder.hidden, false);
  assert.match(holder.innerHTML, /data-rn-remove="feat:dogs"/);
  assert.match(holder.innerHTML, /data-rn-remove="feat:gf"/);
  assert.match(holder.innerHTML, /data-rn-remove="open"/);
  assert.doesNotMatch(holder.innerHTML, /data-rn-remove="town:|data-rn-remove="term"/);
  context.tab = 'events';
  vm.runInContext('updateSelectionChips()', context);
  assert.equal(holder.hidden, true);
  assert.equal(holder.innerHTML, '');
});

test('manual Events entry clears the place query while returning to Places restores it', () => {
  const handlers = {};
  const context = {
    $: id => ({ addEventListener: (type, fn) => { handlers[id] = fn; } }),
    tab: 'places',
    searchEl: { value: 'dog-friendly coffee' },
    setTab: tab => { context.tab = tab; },
  };
  const start = source.indexOf("  var placeSearchText = '';");
  const end = source.indexOf('\n', source.indexOf("    setTab('events');", start));
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\n  });', context);
  handlers.pmTabEvents();
  assert.equal(context.searchEl.value, '');
  context.searchEl.value = 'live music';
  handlers.pmTabPlaces();
  assert.equal(context.searchEl.value, 'dog-friendly coffee');
});

test('removing a parsed requirement keeps free words and does not replay the removed phrase on Back', () => {
  let click;
  const context = {
    $: () => ({ addEventListener: (type, fn) => { click = fn; } }),
    filtersBtn: { focus() {} },
    term: 'bean scene',
    termShown: text => text,
    searchEl: { value: 'dog friendly bean scene' },
    dropOne: id => { context.removed = id; },
    setNameQuery: text => { context.name = text; },
    changed: () => { context.savedQuery = context.searchEl.value; },
  };
  const start = source.indexOf("  $('rnSelectedFilters').addEventListener");
  const end = source.indexOf('  function render(fit){', start);
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  click({ target: { closest: () => ({ getAttribute: () => 'feat:dogs' }) } });
  assert.equal(context.removed, 'feat:dogs');
  assert.equal(context.searchEl.value, 'bean scene');
  assert.equal(context.savedQuery, 'bean scene');
  assert.equal(context.name, 'bean scene');
});
