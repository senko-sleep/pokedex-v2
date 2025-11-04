// API Configuration
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const TCG_API_BASE = 'https://api.pokemontcg.io/v2';
// Global state
let currentPokemonData = null;
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
// Event Listeners
searchForm.addEventListener('submit', handleSearch);
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
        currentPokemonData = data;
        displayResults(data);
        showResults();
        playBeep(880, 200); // Done sound
    } catch (error) {
        showError(error.message || 'Failed to fetch Pokémon data. Please check the name or ID and try again.');
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
        const abilityPromises = pokemon.abilities.map(a =>
            fetch(a.ability.url).then(r => r.json())
        );
        const abilityDetails = await Promise.all(abilityPromises);
      
        // Fetch all forms
        const formPromises = species.varieties.map(v =>
            fetch(v.pokemon.url).then(r => r.json())
        );
        const allForms = await Promise.all(formPromises);
      
        // Fetch TCG cards
        const cardsResponse = await fetch(`${TCG_API_BASE}/cards?q=name:"${pokemon.name}"`);
        const cardsData = await cardsResponse.json();
        const cards = cardsData.data || [];
      
        return {
            pokemon,
            species,
            evolutionChain,
            abilityDetails,
            allForms,
            cards
        };
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
function displayOverview(data) {
    const { pokemon, species, abilityDetails } = data;
  
    const description = species.flavor_text_entries.find(e => e.language.name === 'en');
    const genus = species.genera.find(g => g.language.name === 'en');
  
    const maxStat = Math.max(...pokemon.stats.map(s => s.base_stat));
    const totalStats = pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0);
  
    const html = `
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
                    <img src="${pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default}"
                         alt="${pokemon.name}"
                         class="w-full max-w-xs mx-auto">
                </div>
              
                <div class="space-y-4">
                    <div>
                        <h3 class="font-semibold mb-2">Types</h3>
                        <div class="flex gap-2">
                            ${pokemon.types.map(t => `
                                <span class="type-badge type-${t.type.name}">${t.type.name}</span>
                            `).join('')}
                        </div>
                    </div>
                  
                    <div>
                        <h3 class="font-semibold mb-2">Physical Traits</h3>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div>Height: ${(pokemon.height / 10).toFixed(1)} m</div>
                            <div>Weight: ${(pokemon.weight / 10).toFixed(1)} kg</div>
                            <div>Base Experience: ${pokemon.base_experience}</div>
                        </div>
                    </div>
                  
                    ${description ? `
                        <div>
                            <h3 class="font-semibold mb-2">Description</h3>
                            <p class="text-gray-600 text-sm">${description.flavor_text.replace(/\f/g, ' ')}</p>
                        </div>
                    ` : ''}
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
                            <div class="stat-bar-fill" style="width: ${(stat.base_stat / maxStat) * 100}%"></div>
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
            <div class="pokemon-card-header">
                <h3 class="text-xl font-bold">Abilities</h3>
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
            <div class="pokemon-card-header">
                <h3 class="text-xl font-bold">Breeding Information</h3>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <h4 class="font-semibold mb-2">Egg Groups</h4>
                    <div class="flex flex-wrap gap-2">
                        ${species.egg_groups.map(group => `
                            <span class="badge badge-outline capitalize">${group.name.replace('-', ' ')}</span>
                        `).join('')}
                    </div>
                </div>
                <div>
                    <h4 class="font-semibold mb-2">Gender Ratio</h4>
                    <p class="text-sm">
                        ${species.gender_rate === -1 ? 'Genderless' :
                          `♀ ${(species.gender_rate / 8) * 100}% / ♂ ${((8 - species.gender_rate) / 8) * 100}%`}
                    </p>
                </div>
                <div>
                    <h4 class="font-semibold mb-2">Hatch Counter</h4>
                    <p class="text-sm">${species.hatch_counter * 255} steps</p>
                </div>
            </div>
            <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 class="font-semibold mb-2">Breeding Strategy</h4>
                <ul class="text-sm space-y-1 list-disc list-inside text-gray-600">
                    <li>Breed with Pokémon from the same egg group</li>
                    <li>Use Ditto for easier breeding (works with any Pokémon)</li>
                    <li>Hold Everstone to pass down nature</li>
                    <li>Hold Destiny Knot to pass down 5 IVs</li>
                </ul>
            </div>
        </div>
      
        <div class="pokemon-card">
            <div class="pokemon-card-header">
                <h3 class="text-xl font-bold">Battle Strategy</h3>
            </div>
            <ul class="text-sm space-y-2 list-disc list-inside text-gray-600">
                <li><strong>Role:</strong> ${pokemon.stats[1].base_stat > pokemon.stats[3].base_stat ? 'Physical' : 'Special'} Attacker</li>
                <li><strong>Best Stats:</strong> ${pokemon.stats.sort((a, b) => b.base_stat - a.base_stat).slice(0, 2).map(s => s.stat.name.replace('-', ' ')).join(', ')}</li>
                <li><strong>Type Coverage:</strong> Utilize ${pokemon.types.map(t => t.type.name).join(' and ')} type moves</li>
                <li><strong>Primary Ability:</strong> ${pokemon.abilities[0].ability.name.replace('-', ' ')}</li>
            </ul>
        </div>
    `;
  
    overviewTab.innerHTML = html;
}
function displayEvolution(data) {
    const treeCSS = `
        /* Family tree CSS adapted for evolution chain */
        * {margin: 0; padding: 0;}
        .tree { display: flex; justify-content: center; overflow-x: auto; padding: 20px; }
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
            content: '';
            position: absolute; top: 0; right: 50%;
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
            content: '';
            position: absolute; top: 0; left: 50%;
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
                <div class="card-grid">
                    ${allForms.map(form => `
                        <div class="border rounded-lg p-4 text-center bg-white">
                            <img src="${form.sprites.other['official-artwork'].front_default || form.sprites.front_default}"
                                 alt="${form.name}"
                                 class="w-24 h-24 object-contain mx-auto">
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
        <div class="node">
            <img src="${pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default}"
                 alt="${pokemon.name}">
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
  
    const html = `
        <div class="pokemon-card">
            <div class="pokemon-card-header">
                <h3 class="text-xl font-bold">Visual Gallery</h3>
                <p class="text-sm text-gray-600">All available sprites, artwork, and visual variants</p>
            </div>
          
            <div class="mb-6">
                <div class="flex gap-2 mb-4 border-b">
                    <button class="gallery-tab active px-4 py-2 font-medium" data-gallery="official">Official Art</button>
                    <button class="gallery-tab px-4 py-2 font-medium" data-gallery="shiny">Shiny Variants</button>
                    <button class="gallery-tab px-4 py-2 font-medium" data-gallery="game">Game Sprites</button>
                </div>
              
                <div id="galleryOfficial" class="gallery-content">
                    <div class="sprite-grid">
                        ${officialSprites.map(sprite => `
                            <div class="sprite-item bg-gradient-to-br from-gray-50 to-gray-100">
                                <img src="${sprite.url}" alt="${sprite.label}">
                                <p class="text-sm mt-2 font-medium">${sprite.label}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
              
                <div id="galleryShiny" class="gallery-content hidden">
                    <div class="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p class="text-sm text-yellow-800">
                            <strong>Shiny Pokémon</strong> are extremely rare variants with alternate color schemes.
                            The odds of encountering one in the wild are approximately 1 in 4,096!
                        </p>
                    </div>
                    <div class="sprite-grid">
                        ${shinySprites.map(sprite => `
                            <div class="sprite-item bg-gradient-to-br from-yellow-50 to-amber-100">
                                <img src="${sprite.url}" alt="${sprite.label}">
                                <p class="text-sm mt-2 font-medium">${sprite.label}</p>
                                <span class="badge mt-2 bg-yellow-500 text-white">Shiny</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
              
                <div id="galleryGame" class="gallery-content hidden">
                    <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        ${gameSprites.map(sprite => `
                            <div class="border rounded-lg p-2 bg-gray-50">
                                <img src="${sprite.url}" alt="${sprite.label}" class="w-full h-24 object-contain">
                                <p class="text-xs text-center mt-1">${sprite.label}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
          
            ${allForms.length > 1 ? `
                <div class="mt-8">
                    <h3 class="text-lg font-semibold mb-4">All Forms Gallery</h3>
                    <div class="card-grid">
                        ${allForms.map(form => `
                            <div class="border rounded-lg p-4 bg-white">
                                <img src="${form.sprites.other['official-artwork'].front_default || form.sprites.front_default}"
                                     alt="${form.name}"
                                     class="w-full h-32 object-contain">
                                <p class="text-sm text-center mt-2 font-medium capitalize">${form.name.replace('-', ' ')}</p>
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
        </div>
    `;
  
    galleryTab.innerHTML = html;
  
    // Add gallery tab switching
    const galleryTabs = galleryTab.querySelectorAll('.gallery-tab');
    galleryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const galleryType = tab.getAttribute('data-gallery');
          
            galleryTabs.forEach(t => t.classList.remove('active', 'border-b-2', 'border-blue-600', 'text-blue-600'));
            tab.classList.add('active', 'border-b-2', 'border-blue-600', 'text-blue-600');
          
            galleryTab.querySelectorAll('.gallery-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`gallery${galleryType.charAt(0).toUpperCase() + galleryType.slice(1)}`).classList.remove('hidden');
        });
    });
  
    // Set initial active state
    galleryTabs[0].classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
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
            <div class="pokemon-card-header flex items-center justify-between">
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
            <div id="cardGrid" class="card-grid">
                ${cardsWithPrices.map(card => `
                    <div class="tcg-card">
                        <img src="${card.images.small}" alt="${card.name}">
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
            <img src="${card.images.small}" alt="${card.name}">
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
    const tcgPrice = card.tcgplayer?.prices?.holofoil?.market ||
                     card.tcgplayer?.prices?.reverseHolofoil?.market ||
                     card.tcgplayer?.prices?.normal?.market;
  
    const cardmarketPrice = card.cardmarket?.prices?.averageSellPrice ||
                           card.cardmarket?.prices?.avg30 ||
                           card.cardmarket?.prices?.avg7;
  
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
function switchTab(tabName) {
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
// Sound Function
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
window.addEventListener('load', () => playBeep(440, 200));