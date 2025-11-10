document.addEventListener('DOMContentLoaded', () => {
  // API Configuration
  const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

  // Global state
  let currentPokemonData = null;
  let allCards = null;
  let totalPokemon = null;
  const allTypes = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  let audioCache = new Map();
  let currentMovesPage = 1;
  let currentFilteredMoves = [];
  const MOVES_PER_PAGE = 25;

  // DOM Elements
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorMessage = document.getElementById('errorMessage');
  const emptyState = document.getElementById('emptyState');
  const resultsSection = document.getElementById('resultsSection');
  const cardCount = document.getElementById('cardCount');

  // Tab elements
  const tabButtons = document.querySelectorAll('.tab-button');
  const overviewTab = document.getElementById('overviewTab');
  const evolutionTab = document.getElementById('evolutionTab');
  const galleryTab = document.getElementById('galleryTab');
  const cardsTab = document.getElementById('cardsTab');

  // Create random button
  const randomButton = Object.assign(document.createElement('button'), {
    id: 'randomButton',
    type: 'button',
    textContent: 'Random Pokémon',
    className: 'px-4 py-2 bg-green-500 text-white rounded ml-2'
  });
  searchForm.appendChild(randomButton);

  // Event Listeners
  searchForm.addEventListener('submit', handleSearch);
  randomButton.addEventListener('click', handleRandom);
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Search Handler
  async function handleSearch(e) {
    e.preventDefault();
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;
    showLoading();
    hideError();
    hideResults();
    try {
      const data = await fetchCompletePokemonData(query);
      if (!allCards) {
        const cardsResponse = await fetch('data/cards.json');
        if (!cardsResponse.ok) throw new Error('Failed to load cards.json');
        allCards = await cardsResponse.json();
      }
      const name = data.pokemon.name.toLowerCase();
      data.cards = allCards.filter(card => card.name && card.name.toLowerCase().includes(name));
      currentPokemonData = data;
      displayResults(data);
      showResults();
      //playBeep(880, 200); // Done sound
    } catch (error) {
      showError(error.message || 'Failed to fetch Pokémon data. Please check the name or ID and try again.');
    } finally {
      hideLoading();
    }
  }

  // Random Handler
  async function handleRandom() {
    showLoading();
    hideError();
    hideResults();
    try {
      if (!totalPokemon) {
        const res = await fetch(`${POKEAPI_BASE}/pokemon?limit=1`);
        if (!res.ok) throw new Error('Failed to fetch Pokémon count');
        const json = await res.json();
        totalPokemon = json.count;
      }
      const randomId = Math.floor(Math.random() * totalPokemon) + 1;
      const data = await fetchCompletePokemonData(randomId);
      if (!allCards) {
        const cardsRes = await fetch('data/cards.json');
        if (!cardsRes.ok) throw new Error('Failed to load cards.json');
        allCards = await cardsRes.json();
      }
      const name = (data.pokemon.name || '').toLowerCase().trim();
      data.cards = Array.isArray(allCards) ? allCards.filter(card => card.name && card.name.toLowerCase().includes(name)) : [];
      currentPokemonData = data;
      displayResults(data);
      showResults();
      searchInput.value = data.pokemon.name;
    } catch (e) {
      showError(e.message || 'Failed to fetch random Pokémon data. Please try again.');
    } finally {
      hideLoading();
    }
  }

  // API Functions
  async function fetchCompletePokemonData(nameOrId) {
    try {
      // Fetch basic Pokémon data
      const pokemonResponse = await fetch(`${POKEAPI_BASE}/pokemon/${nameOrId}`);
      if (!pokemonResponse.ok) throw new Error('Pokémon not found');
      const pokemon = await pokemonResponse.json();

      // Fetch species data
      const speciesResponse = await fetch(`${POKEAPI_BASE}/pokemon-species/${pokemon.id}`);
      const species = await speciesResponse.json();

      // Fetch evolution chain
      const evolutionResponse = await fetch(species.evolution_chain.url);
      const evolutionChain = await evolutionResponse.json();

      // Fetch ability details
      const abilityPromises = pokemon.abilities.map(a => fetch(a.ability.url).then(r => r.json()));
      const abilityDetails = await Promise.all(abilityPromises);

      // Fetch all forms
      const formPromises = species.varieties.map(v => fetch(v.pokemon.url).then(r => r.json()));
      const allForms = await Promise.all(formPromises);

      // Fetch egg group details for compatible Pokémon
      const eggGroupPromises = species.egg_groups.map(g => fetch(g.url).then(r => r.json()));
      const eggGroupsData = await Promise.all(eggGroupPromises);
      let compatibleSpecies = new Set();
      eggGroupsData.forEach(group => {
        group.pokemon_species.forEach(s => {
          if (s.name !== species.name.toLowerCase()) {
            compatibleSpecies.add(s.name);
          }
        });
      });

      // Fetch type details
      const typePromises = pokemon.types.map(t => fetch(t.type.url).then(r => r.json()));
      const typeDetails = await Promise.all(typePromises);

      // Fetch move details
      const movePromises = pokemon.moves.map(async (m) => {
        const moveRes = await fetch(m.move.url);
        const moveData = await moveRes.json();
        return { move: moveData, learn: m.version_group_details };
      });
      const moves = await Promise.all(movePromises);

      // Fetch encounters
      const encountersResponse = await fetch(`${POKEAPI_BASE}/pokemon/${pokemon.id}/encounters`);
      const encounters = await encountersResponse.json();

      return { pokemon, species, evolutionChain, abilityDetails, allForms, compatibleSpecies: Array.from(compatibleSpecies).sort(), typeDetails, moves, encounters };
    } catch (error) {
      throw error;
    }
  }

  // Display Functions
  function displayResults(data) {
    cardCount.textContent = `(${data.cards.length})`;
    displayOverview(data);
    displayEvolution(data);
    displayGallery(data);
    displayCards(data);
  }

  function getGenerationDisplay(genName) {
    const roman = { 'i': 'I', 'ii': 'II', 'iii': 'III', 'iv': 'IV', 'v': 'V', 'vi': 'VI', 'vii': 'VII', 'viii': 'VIII', 'ix': 'IX' };
    const regions = { 'i': 'Kanto', 'ii': 'Johto', 'iii': 'Hoenn', 'iv': 'Sinnoh', 'v': 'Unova', 'vi': 'Kalos', 'vii': 'Alola', 'viii': 'Galar', 'ix': 'Paldea' };
    const num = genName.split('-')[1];
    return `${roman[num]} (${regions[num]})`;
  }

  function displayOverview(data) {
    const { pokemon, species, abilityDetails, compatibleSpecies, typeDetails, moves, encounters } = data;
    const description = species.flavor_text_entries.find(e => e.language.name === 'en');
    const genus = species.genera.find(g => g.language.name === 'en');
    const maxStat = Math.max(...pokemon.stats.map(s => s.base_stat));
    const totalStats = pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0);
    let rarity = 'Regular';
    if (species.is_mythical) rarity = 'Mythical';
    else if (species.is_legendary) rarity = 'Legendary';
    else if (species.is_baby) rarity = 'Baby';

    // --- Breeding Information ---
    let breedingHtml = '';
    if (species.egg_groups.some(g => g.name === 'undiscovered' || g.name === 'no-eggs')) {
      breedingHtml = '<p class="text-red-600 text-sm">This Pokémon cannot breed.</p>';
    } else {
      let notes = [];
      if (species.gender_rate === -1) {
        notes.push('Genderless Pokémon can only breed with Ditto.');
      } else if (species.gender_rate === 0) {
        notes.push('All male - must breed with Ditto or compatible female from same egg group.');
      } else if (species.gender_rate === 8) {
        notes.push('All female - must breed with Ditto or compatible male from same egg group.');
      }
      const eggGroups = species.egg_groups.map(g => g.name.replace('-', ' ')).join(' or ');
      const compatibleList = compatibleSpecies.length > 0 ? `
        <details class="mt-4">
          <summary class="font-semibold cursor-pointer">Compatible Pokémon (${compatibleSpecies.length})</summary>
          <ul class="list-disc list-inside text-sm text-gray-600 mt-2 max-h-40 overflow-y-auto">
            ${compatibleSpecies.map(name => `<li class="capitalize">${name}</li>`).join('')}
          </ul>
        </details>
      ` : '<p class="text-sm text-gray-600">No other compatible Pokémon found in egg groups.</p>';
      breedingHtml = `
        <div class="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 class="font-semibold mb-2">Breeding Strategy</h4>
          <ul class="text-sm space-y-1 list-disc list-inside text-gray-600">
            <li>Breed with Pokémon from the same egg group: ${eggGroups}</li>
            <li>Use Ditto for easier breeding${species.gender_rate !== -1 ? ' (works with any gender)' : ''}</li>
            <li>Hold Everstone to pass down nature</li>
            <li>Hold Destiny Knot to pass down 5 IVs</li>
          </ul>
          ${notes.length ? `<p class="mt-2 text-sm text-blue-600">${notes.join('<br>')}</p>` : ''}
          
        </div>
      `;
    }

    // --- Defensive Matchups ---
    let damageMap = {};
    allTypes.forEach(attType => {
      let multi = 1;
      typeDetails.forEach(defType => {
        if (defType.damage_relations.double_damage_from.some(t => t.name === attType)) multi *= 2;
        if (defType.damage_relations.half_damage_from.some(t => t.name === attType)) multi *= 0.5;
        if (defType.damage_relations.no_damage_from.some(t => t.name === attType)) multi *= 0;
      });
      if (multi !== 1) damageMap[attType] = multi;
    });
    const weaknesses = Object.entries(damageMap).filter(([t, m]) => m > 1).sort(([a], [b]) => a.localeCompare(b)).map(([t, m]) => `${capitalize(t)} (${m}x)`);
    const resistances = Object.entries(damageMap).filter(([t, m]) => m > 0 && m < 1).sort(([a], [b]) => a.localeCompare(b)).map(([t, m]) => `${capitalize(t)} (${m}x)`);
    const immunities = Object.entries(damageMap).filter(([t, m]) => m === 0).sort(([a], [b]) => a.localeCompare(b)).map(([t, m]) => `${capitalize(t)} (0x)`);
    const defensiveHtml = `
      <div class="pokemon-card">
        <div class="pokemon-card-header flex justify-between items-center">
          <h3 class="text-xl font-bold">Defensive Matchups</h3>
          <img src="${pokemon.sprites.front_default}" alt="${pokemon.name} icon" class="w-8 h-8 md:w-16 md:h-16" style="image-rendering: pixelated;">
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Types</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Weaknesses</td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  <div class="flex flex-wrap gap-2">
                    ${weaknesses.map(w => {
                      const [type] = w.split(' (');
                      return `<span class="type-badge type-${type.toLowerCase()}">${w}</span>`;
                    }).join('') || '<p class="text-gray-600">None</p>'}
                  </div>
                </td>
              </tr>
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Resistances</td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  <div class="flex flex-wrap gap-2">
                    ${resistances.map(r => {
                      const [type] = r.split(' (');
                      return `<span class="type-badge type-${type.toLowerCase()}">${r}</span>`;
                    }).join('') || '<p class="text-gray-600">None</p>'}
                  </div>
                </td>
              </tr>
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Immunities</td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  <div class="flex flex-wrap gap-2">
                    ${immunities.map(i => {
                      const [type] = i.split(' (');
                      return `<span class="type-badge type-${type.toLowerCase()}">${i}</span>`;
                    }).join('') || '<p class="text-gray-600">None</p>'}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // --- Offensive Matchups ---
    const superEffective = [...new Set(typeDetails.flatMap(td => td.damage_relations.double_damage_to.map(t => t.name)))].sort().map(t => `${capitalize(t)} (2x)`);
    const notVeryEffective = [...new Set(typeDetails.flatMap(td => td.damage_relations.half_damage_to.map(t => t.name)))].sort().map(t => `${capitalize(t)} (0.5x)`);
    const noEffect = [...new Set(typeDetails.flatMap(td => td.damage_relations.no_damage_to.map(t => t.name)))].sort().map(t => `${capitalize(t)} (0x)`);
    const offensiveHtml = `
      <div class="pokemon-card">
        <div class="pokemon-card-header flex justify-between items-center">
          <h3 class="text-xl font-bold">Offensive Matchups</h3>
          <img src="${pokemon.sprites.front_default}" alt="${pokemon.name} icon" class="w-8 h-8 md:w-16 md:h-16" style="image-rendering: pixelated;">
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Types</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Super Effective Against</td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  <div class="flex flex-wrap gap-2">
                    ${superEffective.map(w => {
                      const [type] = w.split(' (');
                      return `<span class="type-badge type-${type.toLowerCase()}">${w}</span>`;
                    }).join('') || '<p class="text-gray-600">None</p>'}
                  </div>
                </td>
              </tr>
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Not Very Effective Against</td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  <div class="flex flex-wrap gap-2">
                    ${notVeryEffective.map(r => {
                      const [type] = r.split(' (');
                      return `<span class="type-badge type-${type.toLowerCase()}">${r}</span>`;
                    }).join('') || '<p class="text-gray-600">None</p>'}
                  </div>
                </td>
              </tr>
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">No Effect On</td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  <div class="flex flex-wrap gap-2">
                    ${noEffect.map(i => {
                      const [type] = i.split(' (');
                      return `<span class="type-badge type-${type.toLowerCase()}">${i}</span>`;
                    }).join('') || '<p class="text-gray-600">None</p>'}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // --- Locations ---
    const uniqueAreas = [...new Set(encounters.map(e => e.location_area.name))];
    const foundIn = uniqueAreas.map(area => {
      let formatted = area.replace(/-/g, ' ').replace('area', 'Area');
      return formatted.split(' ').map(w => capitalize(w)).join(' ');
    }).join(', ');
    const habitat = species.habitat ? capitalize(species.habitat.name) : 'Unknown';

    // --- External Resources ---
    const externalHtml = `
      <div class="pokemon-card">
        <div class="pokemon-card-header flex justify-between items-center">
          <h3 class="text-xl font-bold">External Resources</h3>
          <img src="${pokemon.sprites.front_default}" alt="${pokemon.name} icon" class="w-8 h-8 md:w-16 md:h-16" style="image-rendering: pixelated;">
        </div>
        <ul class="text-sm space-y-2 list-disc list-inside text-gray-600">
          <li><a href="https://bulbapedia.bulbagarden.net/wiki/${capitalize(pokemon.name)}_(Pok%C3%A9mon)" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">Bulbapedia - Detailed Pokémon Info</a></li>
          <li><a href="https://www.serebii.net/pokedex-sv/${String(pokemon.id).padStart(3, '0')}/" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">Serebii - Pokédex Entry</a></li>
          <li><a href="https://pokemondb.net/pokedex/${pokemon.name.toLowerCase()}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">PokemonDB - Pokédex Entry</a></li>
          <li><a href="https://www.pokemon.com/us/pokedex/${pokemon.name.toLowerCase()}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">Official Pokémon Website</a></li>
          <li><a href="https://www.smogon.com/dex/sv/pokemon/${pokemon.name.toLowerCase()}/" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">Smogon - Competitive Analysis</a></li>
        </ul>
      </div>
    `;

    // --- Main Overview HTML ---
    let html = `
      <div class="pokemon-card">
        <div class="pokemon-card-header">
          <div class="flex items-center justify-between">
            <h2 class="pokemon-card-title capitalize">${pokemon.name}</h2>
            <span class="text-2xl text-gray-500">#${pokemon.id.toString().padStart(4, '0')}</span>
          </div>
          ${genus ? `<p class="text-lg text-gray-600 mt-1">${genus.genus}</p>` : ''}
        </div>
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <img src="${pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default}" alt="${pokemon.name}" class="w-full max-w-xs mx-auto">
            <div class="flex mt-2">
              <button id="playLegacyCry" class="px-4 py-2 border border-black rounded bg-transparent text-black transition hover:bg-gray-200">🔊 Cry</button>
              <button id="playLatestCry" class="px-4 py-2 border border-black rounded bg-transparent text-black transition hover:bg-gray-200">🎵 Latest</button>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <h3 class="font-semibold mb-2">Types</h3>
              <div class="flex gap-2">
                ${pokemon.types.map(t => `<span class="type-badge type-${t.type.name}">${t.type.name}</span>`).join('')}
              </div>
            </div>
            <div>
              <h3 class="font-semibold mb-2">Physical Traits</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div>Height: ${(pokemon.height / 10).toFixed(1)} m</div>
                <div>Weight: ${(pokemon.weight / 10).toFixed(1)} kg</div>
                <div>Base Experience: ${pokemon.base_experience}</div>
                <div>Generation: ${getGenerationDisplay(species.generation.name)}</div>
                <div>Capture Rate: ${species.capture_rate}</div>
                <div>Base Happiness: ${species.base_happiness}</div>
                <div>Growth Rate: ${capitalize(species.growth_rate.name.replace('-', ' '))}</div>
                <div>Hatch Counter: ${species.hatch_counter}</div>
                <div>Color: ${capitalize(species.color.name)}</div>
                <div>Shape: ${capitalize(species.shape.name)}</div>
                <div>Habitat: ${habitat}</div>
                <div>Rarity: ${rarity}</div>
              </div>
            </div>
            <div>
              <h3 class="font-semibold mb-2">Found In</h3>
              <p class="text-gray-600 text-sm break-words">${foundIn || 'Not found in the wild'}</p>
            </div>
            ${description ? `<div><h3 class="font-semibold mb-2">Description</h3> <p class="text-gray-600 text-sm">${description.flavor_text.replace(/[\f\n]/g, ' ').replace(/\b([A-ZÀ-ÖØ-Ý]{2,}[A-ZÀ-ÖØ-Ýa-zà-ÿ'’]*)\b/g, w => w.charAt(0) + w.slice(1).toLowerCase())}</p> </div>` : ''}
          </div>
        </div>
      </div>
      <div class="pokemon-card">
        <div class="pokemon-card-header">
          <h3 class="text-xl font-bold">Base Stats</h3>
        </div>
        <div class="space-y-3">
          ${pokemon.stats.map(stat => `
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="capitalize font-medium">${stat.stat.name.replace('-', ' ')}</span>
                <span class="font-bold">${stat.base_stat}</span>
              </div>
              <div class="stat-bar">
                <div class="stat-bar-fill" style="width: ${(stat.base_stat / 255) * 100}%"></div>
              </div>
            </div>
          `).join('')}
          <div class="pt-2 border-t flex justify-between font-bold">
            <span>Total</span>
            <span>${totalStats}</span>
          </div>
        </div>
      </div>
      <div class="pokemon-card">
        <div class="pokemon-card-header flex justify-between items-center">
          <h3 class="text-xl font-bold">Abilities</h3>
          <img src="${pokemon.sprites.front_default}" alt="${pokemon.name} icon" class="w-8 h-8 md:w-16 md:h-16" style="image-rendering: pixelated;">
        </div>
        <div class="space-y-4">
          ${pokemon.abilities.map((ability, idx) => {
            const detail = abilityDetails[idx];
            const effect = detail?.effect_entries.find(e => e.language.name === 'en');
            return `
              <div class="border rounded-lg p-4">
                <div class="flex items-center gap-2 mb-2">
                  <h4 class="font-semibold capitalize">${ability.ability.name.replace('-', ' ')}</h4>
                  ${ability.is_hidden ? '<span class="badge badge-secondary text-xs">Hidden</span>' : ''}
                </div>
                ${effect ? `<p class="text-sm text-gray-600">${effect.short_effect}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="pokemon-card">
        <div class="pokemon-card-header flex justify-between items-center">
          <h3 class="text-xl font-bold">Breeding Information</h3>
          <img src="${pokemon.sprites.front_default}" alt="${pokemon.name} icon" class="w-8 h-8 md:w-16 md:h-16" style="image-rendering: pixelated;">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h4 class="font-semibold mb-2">Egg Groups</h4>
            <div class="flex flex-wrap gap-2">
              ${species.egg_groups.map(group => `<span class="badge badge-outline capitalize">${group.name.replace('-', ' ')}</span>`).join('')}
            </div>
          </div>
          <div>
            <h4 class="font-semibold mb-2">Gender Ratio</h4>
            <p class="text-sm">
              ${species.gender_rate === -1 ? 'Genderless' : `♀ ${(species.gender_rate / 8) * 100}% / ♂ ${((8 - species.gender_rate) / 8) * 100}%`}
            </p>
          </div>
          <div>
            <h4 class="font-semibold mb-2">Hatch Counter</h4>
            <p class="text-sm">${species.hatch_counter * 255} steps</p>
          </div>
        </div>
        ${breedingHtml}
      </div>
      <div class="pokemon-card">
        <div class="pokemon-card-header flex justify-between items-center">
          <h3 class="text-xl font-bold">Battle Strategy</h3>
          <img src="${pokemon.sprites.front_default}" alt="${pokemon.name} icon" class="w-8 h-8 md:w-16 md:h-16" style="image-rendering: pixelated;">
        </div>
        <ul class="text-sm space-y-2 list-disc list-inside text-gray-600">
          <li><strong>Role:</strong> ${pokemon.stats[1].base_stat > pokemon.stats[3].base_stat ? 'Physical' : 'Special'} Attacker</li>
          <li><strong>Best Stats:</strong> ${pokemon.stats.sort((a, b) => b.base_stat - a.base_stat).slice(0, 2).map(s => capitalize(s.stat.name.replace('-', ' '))).join(', ')}</li>
          <li><strong>Type Coverage:</strong> Utilize ${pokemon.types.map(t => capitalize(t.type.name)).join(' and ')} Type Moves</li>
          <li><strong>Primary Ability:</strong> ${capitalize(pokemon.abilities[0].ability.name.replace('-', ' '))}</li>
        </ul>
      </div>
    `;

    // --- Moves Section ---
    html += `
      <div class="pokemon-card">
        <div class="pokemon-card-header flex justify-between items-center">
          <h3 class="text-xl font-bold">Moves</h3>
          <img src="${pokemon.sprites.front_default}" alt="${pokemon.name} icon" class="w-8 h-8 md:w-16 md:h-16" style="image-rendering: pixelized;">
        </div>
        <div class="moves-container">
          <div class="move-filters">
            <div class="filter-group">
              <h4>Type</h4>
              <div id="typeFilters" class="flex flex-wrap gap-1"></div>
            </div>
            <div class="filter-group">
              <h4>Category</h4>
              <div id="categoryFilters" class="flex flex-wrap gap-1"></div>
            </div>
            <div class="filter-group">
              <h4>Sort By</h4>
              <select id="sortMoves" class="text-sm border rounded px-2 py-1">
                <option value="name">Name (A-Z)</option>
                <option value="power">Power (High-Low)</option>
                <option value="accuracy">Accuracy (High-Low)</option>
                <option value="pp">PP (High-Low)</option>
                <option value="type">Type</option>
              </select>
            </div>
          </div>
          <div id="selectedMoveDetails" class="move-details"></div>
          <div id="movesGrid" class="moves-grid"></div>
          <div id="movesPagination" class="mt-4"></div>
        </div>
      </div>
    `;

    html += `${defensiveHtml}
      ${offensiveHtml}
      ${externalHtml}
    `;

    overviewTab.innerHTML = html;

    const playLegacyCry = document.getElementById('playLegacyCry');
    const playLatestCry = document.getElementById('playLatestCry');
    if (playLegacyCry) playLegacyCry.addEventListener('click', () => playPokemonCry('legacy'));
    if (playLatestCry) playLatestCry.addEventListener('click', () => playPokemonCry('latest'));

    // Initialize move filters and display
    renderMoveFilters();
    updateMovesDisplay();
    
    // Add search functionality
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search moves...';
    searchInput.className = 'w-full px-4 py-2 border rounded mb-4';
    searchInput.id = 'moveSearch';
    searchInput.addEventListener('input', (e) => {
      updateMovesDisplay(e.target.value.toLowerCase());
    });
    
    // Insert search input at the beginning of the moves container
    const movesContainer = document.querySelector('.moves-container');
    if (movesContainer) {
      // Insert as first child of the container
      movesContainer.insertBefore(searchInput, movesContainer.firstChild);
    }
  }

  function filterAndSortMoves(moves, filters = {}) {
    const { types = [], categories = [], sortBy = 'name' } = filters;
    
    // Filter moves
    let filteredMoves = moves.filter(({ move }) => {
      // Filter by type
      if (types.length > 0 && !types.includes(move.type.name)) {
        return false;
      }
      
      // Filter by category
      if (categories.length > 0 && !categories.includes(move.damage_class.name)) {
        return false;
      }
      
      return true;
    });
    
    // Sort moves
    filteredMoves.sort((a, b) => {
      const moveA = a.move;
      const moveB = b.move;
      
      switch (sortBy) {
        case 'power':
          return (moveB.power || 0) - (moveA.power || 0);
        case 'accuracy':
          return (moveB.accuracy || 0) - (moveA.accuracy || 0);
        case 'pp':
          return (moveB.pp || 0) - (moveA.pp || 0);
        case 'type':
          return moveA.type.name.localeCompare(moveB.type.name);
        case 'name':
        default:
          return moveA.name.localeCompare(moveB.name);
      }
    });
    
    return filteredMoves;
  }

  function renderMoveFilters() {
    const typeFilters = document.getElementById('typeFilters');
    const categoryFilters = document.getElementById('categoryFilters');
    
    if (!typeFilters || !categoryFilters) return;
    
    // Get all unique types and categories
    const types = new Set();
    const categories = new Set();
    
    currentPokemonData.moves.forEach(({ move }) => {
      types.add(move.type.name);
      categories.add(move.damage_class.name);
    });
    
    // Render type filters
    typeFilters.innerHTML = Array.from(types).sort().map(type => `
      <button class="filter-tag type-badge type-${type}" data-type="${type}">
        ${type}
      </button>
    `).join('');
    
    // Render category filters
    categoryFilters.innerHTML = Array.from(categories).sort().map(category => `
      <button class="filter-tag" data-category="${category}">
        ${capitalize(category)}
      </button>
    `).join('');
    
    // Add event listeners to filter buttons
    document.querySelectorAll('.filter-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        updateMovesDisplay();
      });
    });
    
    // Add event listener to sort select
    const sortSelect = document.getElementById('sortMoves');
    if (sortSelect) {
      sortSelect.addEventListener('change', updateMovesDisplay);
    }
  }
  
  function updateMovesDisplay(searchTerm = '', preservePage = false) {
    if (!preservePage) {
      // Reset to first page only when filters change, not during pagination
      currentMovesPage = 1;
    }
    
    const activeTypes = [];
    const activeCategories = [];
    const sortBy = document.getElementById('sortMoves')?.value || 'name';
    
    // Get active filters
    document.querySelectorAll('.filter-tag.active').forEach(tag => {
      const type = tag.getAttribute('data-type');
      const category = tag.getAttribute('data-category');
      
      if (type) activeTypes.push(type);
      if (category) activeCategories.push(category);
    });
    
    // Filter moves by search term first
    let movesToDisplay = currentPokemonData.moves;
    if (searchTerm) {
      movesToDisplay = movesToDisplay.filter(({ move }) => 
        move.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Filter and sort moves
    currentFilteredMoves = filterAndSortMoves(movesToDisplay, {
      types: activeTypes,
      categories: activeCategories,
      sortBy
    });
    
    // Calculate total pages
    const totalPages = Math.max(1, Math.ceil(currentFilteredMoves.length / MOVES_PER_PAGE));
    
    // Ensure current page is within bounds
    currentMovesPage = Math.min(currentMovesPage, totalPages);
    
    // Get moves for current page
    const startIdx = (currentMovesPage - 1) * MOVES_PER_PAGE;
    const paginatedMoves = currentFilteredMoves.slice(startIdx, startIdx + MOVES_PER_PAGE);
    
    // Update pagination controls
    updatePaginationControls(currentFilteredMoves.length, totalPages);
    
    // Render moves for current page
    renderMovesList(paginatedMoves, searchTerm, currentFilteredMoves.length);
  }
  
  function updatePaginationControls(totalMoves, totalPages) {
    const paginationContainer = document.getElementById('movesPagination');
    if (!paginationContainer) return;
    
    // Don't show pagination if there's only one page
    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }
    
    // Calculate page range to show (max 5 pages at a time)
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentMovesPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    // Generate page numbers
    let pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    
    // Add ellipsis if needed
    let leftEllipsis = startPage > 1 ? '<span class="px-3 py-1">...</span>' : '';
    let rightEllipsis = endPage < totalPages ? '<span class="px-3 py-1">...</span>' : '';
    
    let paginationHTML = `
      <div class="flex flex-col items-center mt-4 space-y-2">
        <div class="text-sm text-gray-600 mb-2">
          Showing ${Math.min((currentMovesPage - 1) * MOVES_PER_PAGE + 1, totalMoves)}-${Math.min(currentMovesPage * MOVES_PER_PAGE, totalMoves)} of ${totalMoves} moves
        </div>
        <div class="flex items-center space-x-1">
          <button 
            class="px-3 py-1 rounded border ${currentMovesPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}" 
            ${currentMovesPage === 1 ? 'disabled' : ''}
            id="firstPage"
            title="First page"
          >
            «
          </button>
          <button 
            class="px-3 py-1 rounded border ${currentMovesPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}" 
            ${currentMovesPage === 1 ? 'disabled' : ''}
            id="prevPage"
            title="Previous page"
          >
            ‹
          </button>
          
          ${startPage > 1 ? `
            <button 
              class="page-number px-3 py-1 rounded border ${1 === currentMovesPage ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-50'}"
              data-page="1"
            >1</button>
            ${leftEllipsis}
          ` : ''}
          
          ${pageNumbers.map(page => `
            <button 
              class="page-number px-3 py-1 rounded border ${page === currentMovesPage ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-50'}"
              data-page="${page}"
            >${page}</button>
          `).join('')}
          
          ${endPage < totalPages ? `
            ${rightEllipsis}
            <button 
              class="page-number px-3 py-1 rounded border ${totalPages === currentMovesPage ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-50'}"
              data-page="${totalPages}"
            >${totalPages}</button>
          ` : ''}
          
          <button 
            class="px-3 py-1 rounded border ${currentMovesPage >= totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}" 
            ${currentMovesPage >= totalPages ? 'disabled' : ''}
            id="nextPage"
            title="Next page"
          >
            ›
          </button>
          <button 
            class="px-3 py-1 rounded border ${currentMovesPage >= totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}" 
            ${currentMovesPage >= totalPages ? 'disabled' : ''}
            id="lastPage"
            title="Last page"
          >
            »
          </button>
        </div>
      </div>
    `;
    
    paginationContainer.innerHTML = paginationHTML;
    
    // Add event listeners
    const addPageClickHandler = (element, page) => {
      if (!element) return;
      
      const handler = () => {
        if (page >= 1 && page <= totalPages && page !== currentMovesPage) {
          currentMovesPage = page;
          updateMovesDisplay(document.getElementById('moveSearch')?.value || '', true);
        }
      };
      
      // Remove existing listeners to prevent duplicates
      const newElement = element.cloneNode(true);
      element.replaceWith(newElement);
      newElement.addEventListener('click', handler);
      return newElement;
    };
    
    // Navigation buttons
    const firstPageBtn = document.getElementById('firstPage');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const lastPageBtn = document.getElementById('lastPage');
    
    if (firstPageBtn) addPageClickHandler(firstPageBtn, 1);
    if (prevPageBtn) addPageClickHandler(prevPageBtn, currentMovesPage - 1);
    if (nextPageBtn) addPageClickHandler(nextPageBtn, currentMovesPage + 1);
    if (lastPageBtn) addPageClickHandler(lastPageBtn, totalPages);
    
    // Numbered page buttons
    document.querySelectorAll('.page-number').forEach(btn => {
      const page = parseInt(btn.getAttribute('data-page'));
      addPageClickHandler(btn, page);
    });
  }
  
  function renderMovesList(moves, searchTerm = '', totalMoves = 0) {
    // If there's a search term, highlight the matching text
    const highlightMatch = (text) => {
      if (!searchTerm) return text;
      const regex = new RegExp(`(${searchTerm})`, 'gi');
      return text.replace(regex, '<span class="bg-yellow-200">$1</span>');
    };
    const movesGrid = document.getElementById('movesGrid');
    if (!movesGrid) return;
    
    if (moves.length === 0) {
      movesGrid.innerHTML = '<div class="col-span-full text-center py-4 text-gray-500">No moves match the selected filters</div>';
      document.getElementById('selectedMoveDetails').classList.remove('active');
      return;
    }
    
    // Add move count display
    const moveCount = document.getElementById('moveCount');
    if (moveCount) {
      moveCount.textContent = `(${totalMoves} moves)`;
    }
    
    movesGrid.innerHTML = moves.map(({ move }) => {
      const type = move.type.name;
      const category = move.damage_class.name;
      const power = move.power ? move.power : '--';
      const accuracy = move.accuracy ? `${move.accuracy}%` : '--';
      const pp = move.pp;
      
      return `
        <div class="move-button" data-move="${move.name}">
          <div class="move-header">
            <span class="move-name">${highlightMatch(capitalize(move.name.replace(/-/g, ' ')))}</span>
          </div>
          <div class="move-stats">
            <div class="move-stat">
              <span>ACC:</span>
              <span>${accuracy}</span>
            </div>
            <div class="move-stat">
              <span>PWR:</span>
              <span>${power}</span>
            </div>
            <div class="move-stat">
              <span>PP:</span>
              <span>${pp}</span>
            </div>
          </div>
          <span class="move-type-badge type-${type}">${type}</span>
          <span class="move-category-badge" style="background: ${getCategoryColor(category)}">
            ${category === 'physical' ? 'PHY' : category === 'special' ? 'SPC' : 'STA'}
          </span>
        </div>
      `;
    }).join('');
    
    // Add click listeners to move buttons
    document.querySelectorAll('.move-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const moveName = btn.getAttribute('data-move');
        const moveData = currentPokemonData.moves.find(m => m.move.name === moveName)?.move;
        if (moveData) {
          // Toggle active state
          document.querySelectorAll('.move-button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          // Show move details
          showMoveDetails(moveData);
        }
      });
    });
  }
  
  function showMoveDetails(move) {
    const detailsEl = document.getElementById('selectedMoveDetails');
    if (!detailsEl) return;
    
    const type = move.type.name;
    const category = move.damage_class.name;
    const power = move.power ? move.power : '--';
    const accuracy = move.accuracy ? `${move.accuracy}%` : '--';
    const pp = move.pp;
    const priority = move.priority || 0;
    const target = getTargetName(move.target.name);
    const description = move.effect_entries.find(e => e.language.name === 'en')?.short_effect || 
                       move.flavor_text_entries.find(e => e.language.name === 'en')?.flavor_text || 
                       'No description available';
    
    // Get additional move flags
    const flags = [];
    if (move.flags) {
      if (move.flags.contact) flags.push('Makes contact');
      if (move.flags.protect) flags.push('Blocked by Protect');
      if (move.flags.mirror) flags.push('Can be copied by Mirror Move');
      if (move.flags.distance) flags.push('Can hit non-adjacent Pokémon');
      if (move.flags.authentic) flags.push('Ignores abilities');
      if (move.flags.bite) flags.push('Biting move');
      if (move.flags.punch) flags.push('Punching move');
      if (move.flags.sound) flags.push('Sound-based move');
      if (move.flags.powder) flags.push('Affected by Powder moves');
      if (move.flags.dance) flags.push('Dance move');
    }
    
    detailsEl.innerHTML = `
      <div class="move-details-header relative bg-white border-2 border-gray-200 rounded-lg p-4 mb-4">
        <h4 class="text-lg font-bold pr-16">${capitalize(move.name.replace(/-/g, ' '))}</h4>
        <span class="move-type-badge type-${type}">${type}</span>
        <span class="move-category-badge" style="background: ${getCategoryColor(category)}">
          ${category === 'physical' ? 'PHY' : category === 'special' ? 'SPC' : 'STA'}
        </span>
      </div>
      <div class="move-description mt-4 text-sm text-gray-700">
         ${description}
      </div>
      
      <div class="move-stats-grid grid grid-cols-5 gap-2 mt-3">
        <div class="stat-box">
          <div class="stat-label">Accuracy</div>
          <div class="stat-value">${accuracy}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Power</div>
          <div class="stat-value">${power}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">PP</div>
          <div class="stat-value">${pp}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Priority</div>
          <div class="stat-value">${priority}</div>
        </div>
        
        <div class="stat-box">
          <div class="stat-label">Target</div>
          <div class="stat-value">${target}</div>
        </div>
      </div>
      
      
      
      ${flags.length > 0 ? `
        <div class="move-flags mt-3 pt-3 border-t border-gray-200">
          <div class="text-xs font-medium text-gray-500 mb-1">Flags</div>
          <div class="flex flex-wrap gap-1">
            ${flags.map(flag => `
              <span class="px-2 py-0.5 bg-gray-100 text-xs rounded">${flag}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
    `;
    
    detailsEl.classList.add('active');
  }
  
  function getCategoryColor(category) {
    const colors = {
      physical: '#e76f51',
      special: '#2a9d8f',
      status: '#e9c46a'
    };
    return colors[category] || '#6c757d';
  }

  function displayEvolution(data) {
    const treeCSS = `
      /* Family tree CSS adapted for evolution chain */
      * {margin: 0; padding: 0;}
      .tree {
        display: flex;
        justify-content: center;
        overflow-x: auto;
        padding: 20px;
      }
      .tree ul {
        padding-top: 20px; position: relative;
        transition: all 0.5s;
        -webkit-transition: all 0.5s;
        -moz-transition: all 0.5s;
      }
      .tree li {
        float: left; text-align: center;
        list-style-type: none;
        position: relative;
        padding: 20px 5px 0 5px;
        transition: all 0.5s;
        -webkit-transition: all 0.5s;
        -moz-transition: all 0.5s;
      }
      .tree li::before, .tree li::after{
        content: ''; position: absolute; top: 0; right: 50%;
        border-top: 1px solid #ccc;
        width: 50%; height: 20px;
      }
      .tree li::after{
        right: auto; left: 50%;
        border-left: 1px solid #ccc;
      }
      .tree li:only-child::after, .tree li:only-child::before {
        display: none;
      }
      .tree li:only-child{ padding-top: 0;}
      .tree li:first-child::before, .tree li:last-child::after{
        border: 0 none;
      }
      .tree li:last-child::before{
        border-right: 1px solid #ccc;
        border-radius: 0 5px 0 0;
        -webkit-border-radius: 0 5px 0 0;
        -moz-border-radius: 0 5px 0 0;
      }
      .tree li:first-child::after{
        border-radius: 5px 0 0 0;
        -webkit-border-radius: 5px 0 0 0;
        -moz-border-radius: 5px 0 0 0;
      }
      .tree ul ul::before{
        content: ''; position: absolute; top: 0; left: 50%;
        border-left: 1px solid #ccc;
        width: 0; height: 20px;
      }
      .tree li .node {
        border: none;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        padding: 10px;
        text-decoration: none;
        color: #000;
        font-family: arial, verdana, tahoma;
        font-size: 14px;
        display: block;
        background: #fff;
        border-radius: 5px;
        -webkit-border-radius: 5px;
        -moz-border-radius: 5px;
        transition: all 0.5s;
        -webkit-transition: all 0.5s;
        -moz-transition: all 0.5s;
        cursor: pointer;
      }
      .tree li .node:hover, .tree li .node:hover+ul li .node {
        background: #c8e4f8; color: #000;
      }
      .tree li .node:hover+ul li::after,
      .tree li .node:hover+ul li::before,
      .tree li .node:hover+ul::before,
      .tree li .node:hover+ul ul::before{
        border-color:  #94a0b4;
      }
      .tree .evolution-method {
        display: block;
        margin: 0 auto 10px auto;
        background: #f3f4f6;
        padding: 4px 8px;
        border-radius: 9999px;
        font-size: 0.75rem;
        color: #4b5563;
        text-align: center;
        max-width: 150px;
        white-space: normal;
      }
      .tree .node img {
        border-radius: 50%;
        width: 80px;
        height: 80px;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      }
      .tree .node .name {
        font-weight: 600;
        text-transform: capitalize;
        margin-top: 8px;
        text-align: center;
      }
      .tree .node .id {
        font-size: 0.875rem;
        color: #6b7280;
        text-align: center;
      }
      .tree .node .types {
        display: flex;
        gap: 4px;
        justify-content: center;
        margin-top: 4px;
      }
      @media (max-width: 640px) {
        .tree li {
          padding: 10px 2px 0 2px;
        }
        .tree .node img {
          width: 60px;
          height: 60px;
        }
        .tree .node {
          padding: 5px;
          font-size: 12px;
        }
        .tree .evolution-method {
          font-size: 0.65rem;
          max-width: 120px;
        }
      }
    `;
    const { evolutionChain, allForms } = data;
    const html = `
      <style>${treeCSS}</style>
      <div class="pokemon-card">
        <div class="pokemon-card-header">
          <h3 class="text-xl font-bold">Evolution Chain</h3>
        </div>
        <div class="evolution-chain" id="evolutionChainContainer">
          <div class="text-center text-gray-500">Loading evolution data...</div>
        </div>
      </div>
      ${allForms.length > 1 ? `
        <div class="pokemon-card">
          <div class="pokemon-card-header">
            <h3 class="text-xl font-bold">Alternate Forms & Variants</h3>
          </div>
          <div class="card-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            ${allForms.map(form => `
              <div class="border rounded-lg p-4 text-center bg-white cursor-pointer" onclick="searchPokemon('${form.name}')">
                <img src="${form.sprites.other['official-artwork'].front_default || form.sprites.front_default}" alt="${form.name}" class="w-24 h-24 object-contain mx-auto">
                <p class="font-medium capitalize mt-2 text-sm">${form.name.replace('-', ' ')}</p>
                <div class="flex gap-1 justify-center mt-1 flex-wrap">
                  ${form.types.map(type => `
                    <span class="badge badge-secondary text-xs">${type.type.name}</span>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
    evolutionTab.innerHTML = html;
    // Load evolution chain data asynchronously
    loadEvolutionChainData(evolutionChain.chain);
  }

  async function loadEvolutionChainData(chain) {
    const container = document.getElementById('evolutionChainContainer');
    try {
      const speciesNames = getAllSpecies(chain);
      const pokemonResponses = await Promise.all(
        speciesNames.map(name => fetch(`${POKEAPI_BASE}/pokemon/${name}`))
      );
      const pokemonData = await Promise.all(pokemonResponses.map(r => r.json()));
      const pokemonMap = new Map(pokemonData.map(p => [p.name.toLowerCase(), p]));
      const html = buildEvolutionHTML(chain, pokemonMap);
      container.innerHTML = `<div class="tree"><ul>${html}</ul></div>`;
    } catch (error) {
      container.innerHTML = '<div class="text-center text-red-500">Failed to load evolution data</div>';
    }
  }

  function buildEvolutionHTML(node, pokemonMap, method = '') {
    const name = node.species.name.toLowerCase();
    const pokemon = pokemonMap.get(name);
    if (!pokemon) return '';
    const nodeHtml = `
      ${method ? `<span class="evolution-method">${method}</span>` : ''}
      <div class="node" onclick="searchPokemon('${pokemon.name}')">
        <img src="${pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default}" alt="${pokemon.name}">
        <div class="name">${pokemon.name}</div>
        <div class="id">#${pokemon.id.toString().padStart(4, '0')}</div>
        <div class="types">
          ${pokemon.types.map(t => `
            <span class="type-badge type-${t.type.name}">${t.type.name}</span>
          `).join('')}
        </div>
      </div>
    `;
    const childrenHtml = node.evolves_to.map(child => {
      const childMethod = getEvolutionMethod(child.evolution_details);
      return buildEvolutionHTML(child, pokemonMap, childMethod);
    }).join('');
    return `
      <li>
        ${nodeHtml}
        ${childrenHtml ? `<ul>${childrenHtml}</ul>` : ''}
      </li>
    `;
  }

  function displayGallery(data) {
    const { pokemon, allForms } = data;
    const sprites = getAllSprites(pokemon);
    const officialSprites = sprites.filter(s => s.category === 'official');
    const shinySprites = sprites.filter(s => s.category === 'shiny');
    const gameSprites = sprites.filter(s => s.category === 'game' || s.category === 'home');
    const renderGallerySection = (id, items, title, description = '', isShiny = false) => {
      if (!items.length) return '';
      return `
        <div id="gallery${id}" class="gallery-content ${id !== 'Official' ? 'hidden' : ''}">
          ${description ? `
            <div class="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
              <p class="text-sm text-blue-800">${description}</p>
            </div>
          ` : ''}
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            ${items.map(sprite => `
              <div class="gallery-item bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                <div class="p-4 h-40 flex items-center justify-center bg-gray-50">
                  <img src="${sprite.url}" alt="${sprite.label}" class="max-h-full max-w-full object-contain" loading="lazy" >
                </div>
                <div class="p-3 border-t border-gray-100">
                  <p class="text-sm font-medium text-center text-gray-800 truncate">${sprite.label}</p>
                  ${isShiny ? `
                    <div class="flex justify-center mt-2">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <svg class="mr-1.5 h-2 w-2 text-yellow-400" fill="currentColor" viewBox="0 0 8 8">
                          <circle cx="4" cy="4" r="3" />
                        </svg>
                        Shiny
                      </span>
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };
    const html = `
      <div class="space-y-8">
        <div class="text-center mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Pokémon Gallery</h2>
          <p class="mt-2 text-sm text-gray-600">Explore all available artwork and sprites</p>
        </div>
        <div class="mb-8">
          <div class="flex flex-wrap gap-2 justify-center mb-6">
            <button class="gallery-tab ${officialSprites.length ? 'active' : 'opacity-50 cursor-not-allowed'} px-4 py-2 rounded-md font-medium text-sm transition-colors duration-200 ${officialSprites.length ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400'}" data-gallery="official" ${!officialSprites.length ? 'disabled' : ''}> Official Art </button>
            <button class="gallery-tab ${gameSprites.length ? '' : 'opacity-50 cursor-not-allowed'} px-4 py-2 rounded-md font-medium text-sm transition-colors duration-200 ${gameSprites.length ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400'}" data-gallery="game" ${!gameSprites.length ? 'disabled' : ''}> Game Sprites </button>
            <button class="gallery-tab ${shinySprites.length ? '' : 'opacity-50 cursor-not-allowed'} px-4 py-2 rounded-md font-medium text-sm transition-colors duration-200 ${shinySprites.length ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400'}" data-gallery="shiny" ${!shinySprites.length ? 'disabled' : ''}> Shiny Variants </button>
          </div>
          ${renderGallerySection('Official', officialSprites, 'Official Artwork', 'High-quality official artwork from the Pokémon games and media.')}
          ${renderGallerySection('Game', gameSprites, 'Game Sprites', 'Sprites used in various Pokémon games.')}
          ${renderGallerySection('Shiny', shinySprites, 'Shiny Variants', 'Shiny Pokémon are extremely rare variants with alternate color schemes. The odds of encountering one in the wild are approximately 1 in 4,096!', true)}
        </div>
        ${allForms.length > 1 ? `
          <div class="mt-12">
            <div class="text-center mb-6">
              <h3 class="text-xl font-semibold text-gray-900">Alternate Forms</h3>
              <p class="mt-1 text-sm text-gray-500">Different forms and variants of ${pokemon.name}</p>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              ${allForms.map(form => {
                const formName = form.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const imgUrl = form.sprites.other?.['official-artwork']?.front_default || form.sprites.front_default;
                return `
                  <div class="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                    <div class="p-4 h-40 flex items-center justify-center bg-gray-50">
                      <img src="${imgUrl}" alt="${form.name}" class="max-h-full max-w-full object-contain" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/200/eee?text=Image+Not+Found'" >
                    </div>
                    <div class="p-3 border-t border-gray-100">
                      <p class="text-sm font-medium text-center text-gray-900 mb-2">${formName}</p>
                      <div class="flex flex-wrap justify-center gap-1">
                        ${form.types.map(type => `
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            ${type.type.name.charAt(0).toUpperCase() + type.type.name.slice(1)}
                          </span>
                        `).join('')}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    galleryTab.innerHTML = html;

    // Add gallery tab switching with smooth transitions
    const galleryTabs = galleryTab.querySelectorAll('.gallery-tab:not(:disabled)');
    galleryTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const galleryType = tab.getAttribute('data-gallery');
        const targetId = `gallery${galleryType.charAt(0).toUpperCase() + galleryType.slice(1)}`;
        const targetElement = document.getElementById(targetId);
        if (!targetElement) return;
        // Update active tab
        galleryTabs.forEach(t => {
          t.classList.remove('active', 'bg-blue-50', 'font-semibold');
          t.classList.add('font-medium');
        });
        tab.classList.add('active', 'bg-blue-50', 'font-semibold');
        tab.classList.remove('font-medium');
        // Hide all gallery sections and show the selected one with a fade effect
        galleryTab.querySelectorAll('.gallery-content').forEach(content => {
          content.classList.add('hidden', 'opacity-0');
          content.classList.remove('opacity-100');
        });
        targetElement.classList.remove('hidden');
        // Force reflow to enable transition
        void targetElement.offsetWidth;
        targetElement.classList.add('opacity-100');
        // Scroll to the top of the gallery section
        galleryTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    // Set initial active state if there are any tabs
    if (galleryTabs.length > 0) {
      galleryTabs[0].click();
    }
  }

  function displayCards(data) {
    const { cards } = data;
    if (cards.length === 0) {
      cardsTab.innerHTML = `
        <div class="pokemon-card">
          <div class="pokemon-card-header">
            <h3 class="text-xl font-bold">Trading Card Collection</h3>
          </div>
          <p class="text-gray-500 text-center py-8">No trading cards found for this Pokémon.</p>
        </div>
      `;
      return;
    }
    const cardsWithPrices = cards.map(card => ({
      ...card,
      price: getCardPrice(card)
    })).sort((a, b) => b.price - a.price);
    const html = `
      <div class="pokemon-card">
        <div class="pokemon-card-header flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 class="text-xl font-bold">Trading Card Collection</h3>
            <p class="text-sm text-gray-600 mt-1">Found ${cards.length} cards</p>
          </div>
          <select id="cardSort" class="px-4 py-2 border border-gray-300 rounded-lg">
            <option value="price-high">Price: High to Low</option>
            <option value="price-low">Price: Low to High</option>
            <option value="date-new">Date: Newest First</option>
            <option value="date-old">Date: Oldest First</option>
          </select>
        </div>
        <div id="cardGrid" class="card-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          ${cardsWithPrices.map(card => `
            <div class="tcg-card">
              <img src="${card.images.small}" alt="${card.name}" class="w-full object-contain">
              <div class="p-3 space-y-2">
                <p class="font-semibold text-sm truncate">${card.name}</p>
                <div class="flex flex-col gap-1">
                  <span class="badge badge-outline text-xs truncate">${card.set.name}</span>
                  ${card.rarity ? `
                    <span class="badge rarity-${card.rarity.toLowerCase().replace(/\s+/g, '-')} text-white text-xs">
                      ${card.rarity}
                    </span>
                  ` : ''}
                </div>
                <div class="text-sm">
                  <p class="text-gray-500 text-xs">${card.set.releaseDate}</p>
                  ${card.price > 0 ? `<p class="font-bold text-green-600 mt-1">$${card.price.toFixed(2)}</p>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    cardsTab.innerHTML = html;

    // Add sort functionality
    document.getElementById('cardSort').addEventListener('change', (e) => {
      sortCards(cardsWithPrices, e.target.value);
    });
  }

  function sortCards(cards, sortBy) {
    let sorted = [...cards];
    switch (sortBy) {
      case 'price-high':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'price-low':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'date-new':
        sorted.sort((a, b) => new Date(b.set.releaseDate) - new Date(a.set.releaseDate));
        break;
      case 'date-old':
        sorted.sort((a, b) => new Date(a.set.releaseDate) - new Date(b.set.releaseDate));
        break;
    }
    const cardGrid = document.getElementById('cardGrid');
    cardGrid.innerHTML = sorted.map(card => `
      <div class="tcg-card">
        <img src="${card.images.small}" alt="${card.name}" class="w-full object-contain">
        <div class="p-3 space-y-2">
          <p class="font-semibold text-sm truncate">${card.name}</p>
          <div class="flex flex-col gap-1">
            <span class="badge badge-outline text-xs truncate">${card.set.name}</span>
            ${card.rarity ? `
              <span class="badge rarity-${card.rarity.toLowerCase().replace(/\s+/g, '-')} text-white text-xs">
                ${card.rarity}
              </span>
            ` : ''}
          </div>
          <div class="text-sm">
            <p class="text-gray-500 text-xs">${card.set.releaseDate}</p>
            ${card.price > 0 ? `<p class="font-bold text-green-600 mt-1">$${card.price.toFixed(2)}</p>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  // Helper Functions
  function capitalize(str) {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  function getTargetName(target) {
    const targetMap = {
      'specific-move': 'Specific Move',
      'selected-pokemon-me-first': 'Selected Pokémon (Me First)',
      'ally': 'Ally',
      'users-field': "User's Field",
      'user-or-ally': 'User or Ally',
      'opponents-field': "Opponent's Field",
      'user': 'User',
      'random-opponent': 'Random Opponent',
      'all-other-pokemon': 'All Other Pokémon',
      'selected-pokemon': 'Selected Pokémon',
      'all-opponents': 'All Opponents',
      'entire-field': 'Entire Field',
      'user-and-allies': 'User and Allies',
      'all-pokemon': 'All Pokémon',
      'all-allies': 'All Allies',
      'fainting-pokemon': 'Fainting Pokémon'
    };
    return targetMap[target] || capitalize(target.replace('-', ' '));
  }

  function getAllSpecies(chain) {
    const species = new Set();
    function traverse(node) {
      species.add(node.species.name.toLowerCase());
      node.evolves_to.forEach(traverse);
    }
    traverse(chain);
    return Array.from(species);
  }

  function getEvolutionMethod(details) {
    if (!details || details.length === 0) return '';
    const detail = details[0];
    const methods = [];
    if (detail.min_level) methods.push(`Level ${detail.min_level}`);
    if (detail.item) methods.push(`Use ${detail.item.name.replace('-', ' ')}`);
    if (detail.held_item) methods.push(`Hold ${detail.held_item.name.replace('-', ' ')}`);
    if (detail.known_move) methods.push(`Know ${detail.known_move.name.replace('-', ' ')}`);
    if (detail.min_happiness) methods.push(`Happiness ${detail.min_happiness}+`);
    if (detail.min_beauty) methods.push(`Beauty ${detail.min_beauty}+`);
    if (detail.time_of_day) methods.push(`${detail.time_of_day} time`);
    if (detail.location) methods.push(`At ${detail.location.name.replace('-', ' ')}`);
    if (detail.trade_species) methods.push(`Trade for ${detail.trade_species.name}`);
    if (detail.trigger.name === 'trade') methods.push('Trade');
    return methods.join(', ') || 'Unknown method';
  }

  function getAllSprites(pokemon) {
    const sprites = [];
    // Official artwork
    if (pokemon.sprites.other['official-artwork'].front_default) {
      sprites.push({ url: pokemon.sprites.other['official-artwork'].front_default, label: 'Official Artwork', category: 'official' });
    }
    if (pokemon.sprites.other['official-artwork'].front_shiny) {
      sprites.push({ url: pokemon.sprites.other['official-artwork'].front_shiny, label: 'Official Artwork (Shiny)', category: 'shiny' });
    }
    // Home sprites
    if (pokemon.sprites.other.home.front_default) {
      sprites.push({ url: pokemon.sprites.other.home.front_default, label: 'Home (Default)', category: 'home' });
    }
    if (pokemon.sprites.other.home.front_shiny) {
      sprites.push({ url: pokemon.sprites.other.home.front_shiny, label: 'Home (Shiny)', category: 'shiny' });
    }
    if (pokemon.sprites.other.home.front_female) {
      sprites.push({ url: pokemon.sprites.other.home.front_female, label: 'Home (Female)', category: 'home' });
    }
    if (pokemon.sprites.other.home.front_shiny_female) {
      sprites.push({ url: pokemon.sprites.other.home.front_shiny_female, label: 'Home (Shiny Female)', category: 'shiny' });
    }
    // Dream World
    if (pokemon.sprites.other.dream_world.front_default) {
      sprites.push({ url: pokemon.sprites.other.dream_world.front_default, label: 'Dream World', category: 'official' });
    }
    // Game sprites
    const gameSprites = [
      { url: pokemon.sprites.front_default, label: 'Front (Default)', category: 'game' },
      { url: pokemon.sprites.front_shiny, label: 'Front (Shiny)', category: 'shiny' },
      { url: pokemon.sprites.front_female, label: 'Front (Female)', category: 'game' },
      { url: pokemon.sprites.front_shiny_female, label: 'Front (Shiny Female)', category: 'shiny' },
      { url: pokemon.sprites.back_default, label: 'Back (Default)', category: 'game' },
      { url: pokemon.sprites.back_shiny, label: 'Back (Shiny)', category: 'shiny' },
      { url: pokemon.sprites.back_female, label: 'Back (Female)', category: 'game' },
      { url: pokemon.sprites.back_shiny_female, label: 'Back (Shiny Female)', category: 'shiny' }
    ];
    gameSprites.forEach(sprite => {
      if (sprite.url) sprites.push(sprite);
    });
    // Showdown sprites
    if (pokemon.sprites.other.showdown?.front_default) {
      sprites.push({ url: pokemon.sprites.other.showdown.front_default, label: 'Showdown (Front)', category: 'game' });
    }
    if (pokemon.sprites.other.showdown?.front_shiny) {
      sprites.push({ url: pokemon.sprites.other.showdown.front_shiny, label: 'Showdown (Shiny)', category: 'shiny' });
    }
    if (pokemon.sprites.other.showdown?.back_default) {
      sprites.push({ url: pokemon.sprites.other.showdown.back_default, label: 'Showdown (Back)', category: 'game' });
    }
    if (pokemon.sprites.other.showdown?.back_shiny) {
      sprites.push({ url: pokemon.sprites.other.showdown.back_shiny, label: 'Showdown (Back Shiny)', category: 'shiny' });
    }
    return sprites;
  }

  function getCardPrice(card) {
    const tcgPrice = card.tcgplayer?.prices?.holofoil?.market || card.tcgplayer?.prices?.reverseHolofoil?.market || card.tcgplayer?.prices?.normal?.market;
    const cardmarketPrice = card.cardmarket?.prices?.averageSellPrice || card.cardmarket?.prices?.avg30 || card.cardmarket?.prices?.avg7;
    return tcgPrice || cardmarketPrice || 0;
  }

  // UI State Functions
  function showLoading() {
    loadingState.classList.remove('hidden');
  }

  function hideLoading() {
    loadingState.classList.add('hidden');
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorState.classList.remove('hidden');
  }

  function hideError() {
    errorState.classList.add('hidden');
  }

  function showResults() {
    emptyState.classList.add('hidden');
    resultsSection.classList.remove('hidden');
  }

  function hideResults() {
    resultsSection.classList.add('hidden');
  }

  async function switchTab(tabName) {
    // Update button states
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    // Update content visibility
    const tabs = {
      overview: overviewTab,
      evolution: evolutionTab,
      gallery: galleryTab,
      cards: cardsTab
    };
    Object.keys(tabs).forEach(key => {
      if (key === tabName) {
        tabs[key].classList.remove('hidden');
        tabs[key].classList.add('active');
      } else {
        tabs[key].classList.add('hidden');
        tabs[key].classList.remove('active');
      }
    });
  }

  // Sound Functions
  function playBeep(frequency = 440, duration = 200) {
    if (!window.AudioContext) return;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(audioCtx.destination);
    oscillator.start();
    setTimeout(() => oscillator.stop(), duration);
  }

  async function playPokemonCry(type = 'legacy') {
    if (!currentPokemonData) return;
    const pokemonId = currentPokemonData.pokemon.id;
    const cacheKey = `${pokemonId}_${type}`;
    try {
      let audioUrl;
      if (type === 'latest') {
        audioUrl = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${pokemonId}.ogg`;
      } else {
        audioUrl = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/${pokemonId}.ogg`;
      }
      if (!audioCache.has(cacheKey)) {
        const audio = new Audio(audioUrl);
        audioCache.set(cacheKey, audio);
      }
      const audio = audioCache.get(cacheKey);
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      console.error('Error playing Pokemon cry:', error);
      showError('Pokemon cry not available');
    }
  }

  function searchPokemon(name) {
    searchInput.value = name;
    searchForm.submit();
  }

  // Load random Pokémon on page load
  handleRandom();
});